/* ==================================================================
   offline_llm.js
   Unified Offline LLM Service (Node.js + Browser)
   Uses node-llama-cpp for Node and wllama for Browser
   ================================================================== */
import { DEFAULT_CONFIG } from '../env/config.js';

const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

// Serializes all LLM calls — CPU inference is single-threaded, concurrent
// calls just thrash the KV cache and slow everything down.
class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
    }
    async acquire() {
        if (this.current < this.max) { this.current++; return; }
        await new Promise(resolve => this.queue.push(resolve));
    }
    release() {
        this.current--;
        if (this.queue.length > 0) {
            this.current++;
            this.queue.shift()();
        }
    }
}

export class OfflineLLM {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.session = null;   // Persistent LlamaChatSession (Node)
        this.model = null;
        this.context = null;
        this.initialized = false;
        this.failed = false;
        this._initPromise = null;
        // CPU is single-threaded for inference — keep concurrency at 1
        this.semaphore = new Semaphore(1);
    }

    async init() {
        if (this.initialized) return;
        if (this.failed) throw new Error('OfflineLLM previously failed to initialize.');
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            console.log(`[OfflineLLM] Initializing in ${IS_NODE ? 'Node' : 'Browser'} environment...`);
            try {
                if (IS_NODE) {
                    await this._initNode();
                } else {
                    await this._initBrowser();
                }
                this.initialized = true;
                console.log('[OfflineLLM] Ready.');
            } catch (err) {
                this.failed = true;
                throw err;
            } finally {
                this._initPromise = null;
            }
        })();

        return this._initPromise;
    }

    /* -----------------------------------------------------------------
       NODE.JS IMPLEMENTATION (node-llama-cpp)
       Creates ONE persistent session at boot — the same pattern that
       worked before. No per-request session allocation overhead.
       ----------------------------------------------------------------- */
    async _initNode() {
        try {
            const { getLlama, LlamaChatSession, resolveChatWrapper, JinjaTemplateChatWrapper } = await import('node-llama-cpp');
            const fs = await import('fs');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const projectRoot = path.join(__dirname, '..', '..');

            const modelKey = this.config.llm_model || 'Qwen3.5-4B-Q4';


            const modelConf = this.config.offline_models[modelKey];
            if (!modelConf) throw new Error(`Model config not found for: ${modelKey}`);


            const modelPath = path.resolve(projectRoot, modelConf.path);

            if (!fs.existsSync(modelPath)) {
                await this._downloadModelNode(modelConf.url, modelPath);
            }

            console.log(`[OfflineLLM] Loading model from ${modelPath}...`);
            // CPU inference — no GPU auto-detection overhead
            const llama = await getLlama({ gpu: false });
            this.model = await llama.loadModel({
                modelPath,
                gpuLayers: 0
            });

            // Small context: configured via max_tokens to prevent memory bloat and guarantee scalability.
            this.context = await this.model.createContext({ contextSize: this.config.max_tokens || 1024 });

            let chatWrapper = resolveChatWrapper(this.model);
            if (modelKey.includes('MiniCPM')) {
                console.log('[OfflineLLM] Disabling thinking mode for MiniCPM...');
                const templateStr = this.model.fileInfo?.metadata?.tokenizer?.chat_template;
                if (templateStr) {
                    chatWrapper = new JinjaTemplateChatWrapper({
                        template: templateStr,
                        additionalRenderParameters: { enable_thinking: false }
                    });
                }
            }
            this.chatWrapper = chatWrapper;

            // Single persistent session — reused across all calls (original pattern)
            this.session = new LlamaChatSession({
                contextSequence: this.context.getSequence(),
                chatWrapper: this.chatWrapper
            });

        } catch (err) {
            console.error('[OfflineLLM] Node initialization failed:', err);
            throw err;
        }
    }

    async _downloadModelNode(url, destPath) {
        console.log(`[OfflineLLM] Model not found. Downloading from ${url}...`);
        const fs = await import('fs');
        const { Readable } = await import('stream');
        const { finished } = await import('stream/promises');

        const dir = destPath.split('/').slice(0, -1).join('/');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download model: ${res.statusText}`);

        const stream = fs.createWriteStream(destPath);
        await finished(Readable.fromWeb(res.body).pipe(stream));
        console.log('[OfflineLLM] Download complete.');
    }

    async _generateNode(prompt, signal) {
        if (!this.session) throw new Error('OfflineLLM not initialized');

        if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

        console.log('[OfflineLLM] Generating...');
        let accumulatedText = '';
        const controller = new AbortController();
        let tokenCount = 0;

        const onAbort = () => {
            controller.abort();
        };

        if (signal?.aborted) {
            onAbort();
        } else {
            signal?.addEventListener('abort', onAbort, { once: true });
        }

        try {
            const { LlamaChatSession } = await import('node-llama-cpp');
            let sequence = null;
            try {
                const s = this.session?.sequence;
                if (s && !s.disposed) {
                    sequence = s;
                }
            } catch (e) {
                // Sequence is disposed or throws DisposedError
            }

            if (!sequence) {
                console.log('[OfflineLLM] Allocating fresh context sequence...');
                sequence = this.context.getSequence();
            } else {
                if (typeof sequence.clearHistory === 'function') {
                    sequence.clearHistory();
                }
            }

            this.session = new LlamaChatSession({
                contextSequence: sequence,
                chatWrapper: this.chatWrapper
            });

            await this.session.prompt(prompt, {
                maxTokens: this.config.max_tokens || 1024,
                temperature: 0.3,
                customStopTriggers: ["<|im_end|>", "<|im_start|>", "User:", "Assistant:"],
                signal: controller.signal,
                onToken: (tokens) => {
                    // Empty arrays are prefill ticks — do NOT count them.
                    // Only real token arrays (len > 0) count toward the limit.
                    const len = Array.isArray(tokens) ? tokens.length : 1;
                    if (len > 0) {
                        tokenCount += len;
                        const limit = this.config.max_tokens || 1024;
                        if (tokenCount >= limit) {
                            console.log('[OfflineLLM] Token limit reached, aborting.');
                            controller.abort();
                        }
                    }
                },
                onTextChunk: (text) => {
                    accumulatedText += text;
                    process.stdout.write(text);
                }
            });
        } catch (err) {
            if (signal?.aborted) {
                throw new Error('Simulation Cancelled by user.');
            }
            if (err.name !== 'AbortError' && !err.message?.includes('aborted')) {
                throw err;
            }
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }

        process.stdout.write('\n');
        console.log('\n[OfflineLLM] raw result:', accumulatedText);
        return accumulatedText;
    }

    /* -----------------------------------------------------------------
       BROWSER IMPLEMENTATION (wllama)
       ----------------------------------------------------------------- */
    async _initBrowser() {
        try {
            const { Wllama } = await import('../utils/wllama/index.js');

            const basePath = typeof chrome !== 'undefined' && chrome.runtime
                ? chrome.runtime.getURL('utils/wllama')
                : '../utils/wllama';

            const paths = {
                'single-thread/wllama.wasm': `${basePath}/single-thread/wllama.wasm`,
                'multi-thread/wllama.wasm': `${basePath}/multi-thread/wllama.wasm`,
            };

            this.session = new Wllama(paths, { n_threads: 1, suppressNativeLog: true });

            const modelKey = this.config.llm_model || 'Qwen3.5-4B-Q4';
            const modelConf = this.config.offline_models[modelKey];
            if (!modelConf) throw new Error(`Model config not found for: ${modelKey}`);

            console.log(`[OfflineLLM] Downloading/Loading model from ${modelConf.url}...`);
            await this.session.loadModelFromUrl(modelConf.url, {
                n_ctx: 8192,
                progressCallback: (loaded, total) => {
                    const loadedNum = Number(loaded) || 0;
                    const totalNum = Number(total) || 0;
                    if (totalNum > 0) {
                        console.log(`[OfflineLLM] Model download: ${Math.round((loadedNum / totalNum) * 100)}%`);
                    }
                }
            });

            console.log('[OfflineLLM] Wllama initialized.');
        } catch (err) {
            console.error('[OfflineLLM] Browser initialization failed:', err);
            throw err;
        }
    }

    /* -----------------------------------------------------------------
       PUBLIC API
       ----------------------------------------------------------------- */
    async generate(prompt, signal = undefined) {
        if (!this.initialized) await this.init();

        if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

        const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
        const lowerPrompt = cleanPrompt.toLowerCase();
        if (lowerPrompt === 'localllm' || lowerPrompt === 'local llm' || lowerPrompt === 'local_llm') {
            console.log(`[OfflineLLM] Intercepted informational query "${cleanPrompt}". Returning local configuration documentation.`);
            return JSON.stringify({
                status: "active",
                provider: "localllm",
                model: this.config.llm_model || 'Qwen3.5-4B-Q4',
                max_tokens: this.config.max_tokens || 1024,
                documentation: "Local LLM is running in single-threaded CPU mode using node-llama-cpp on Node and wllama on Browser. Model path is configured in extension/env/config.js. Concurrency is limited to 1 via a Semaphore to prevent thrashing KV cache."
            });
        }

        await this.semaphore.acquire();
        try {
            if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

            let effectivePrompt = prompt;
            if (typeof effectivePrompt === 'string' && effectivePrompt.startsWith('/no_think')) {
                effectivePrompt = effectivePrompt.replace(/^\/no_think\s*/, '');
            }

            let response;
            if (IS_NODE) {
                response = await this._generateNode(effectivePrompt, signal);
            } else {
                response = await this.session.createCompletion(effectivePrompt, {
                    n_predict: this.config.max_tokens || 1024,
                    temperature: 0.3,
                    signal
                });
            }

            if (!response || response.trim() === '') {
                throw new Error('Local model returned empty response.');
            }
            return response;
        } finally {
            this.semaphore.release();
        }
    }
}

// Singleton instance
let instance = null;
export async function getOfflineLLM() {
    if (!instance) instance = new OfflineLLM();
    return instance;
}
