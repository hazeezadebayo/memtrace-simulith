/* ==================================================================
   llm/agent.js
   LLM Client Wrappers (Gemini, OpenAI, Local)
   ================================================================== */
import { rateLimit, withBackoff } from '../core/llm-limiter.js';
import { DEFAULT_CONFIG } from '../env/config.js';


/* -----------------------------------------------------------------
   GEMINI CLIENT
   ----------------------------------------------------------------- */
export async function callGemini(apiKey, prompt, model = 'gemini-2.5-flash-lite', temperature = undefined, signal = undefined) {
    const { release, limiter } = await rateLimit(apiKey || 'gemini');
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const body = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: temperature !== undefined ? temperature : 0.3, topP: 0.9, maxOutputTokens: DEFAULT_CONFIG.max_tokens || 1024 }
        };
        const r = await withBackoff(() => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }), 3, 1000, signal);
        if (!r.ok) {
            if (r.status === 429 && limiter) {
                const retryAfter = r.headers.get('retry-after');
                if (retryAfter) limiter.onRateLimited(parseInt(retryAfter) * 1000);
            }
            throw new Error(`Gemini: ${r.status} ${await r.text()}`);
        }
        const j = await r.json();
        return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    } finally {
        release();
    }
}

/* -----------------------------------------------------------------
   OPENAI CLIENT
   ----------------------------------------------------------------- */
export async function callOpenAI(apiKey, prompt, model = 'gpt-4o-mini', temperature = undefined, signal = undefined) {
    const { release, limiter } = await rateLimit(apiKey || 'openai');
    try {
        const url = 'https://api.openai.com/v1/chat/completions';
        const body = { model, messages: [{ role: 'user', content: prompt }], temperature: temperature !== undefined ? temperature : 0.3, max_tokens: DEFAULT_CONFIG.max_tokens || 1024 };
        const r = await withBackoff(() => fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal
        }), 3, 1000, signal);
        if (!r.ok) {
            if (r.status === 429 && limiter) {
                const retryAfter = r.headers.get('retry-after');
                if (retryAfter) limiter.onRateLimited(parseInt(retryAfter) * 1000);
            }
            throw new Error(`OpenAI: ${r.status} ${await r.text()}`);
        }
        const j = await r.json();
        return j.choices?.[0]?.message?.content?.trim() ?? '';
    } finally {
        release();
    }
}

/* -----------------------------------------------------------------
   OPENROUTER CLIENT
   ----------------------------------------------------------------- */
export async function callOpenRouter(apiKey, prompt, model = 'anthropic/claude-3-haiku', temperature = undefined, signal = undefined) {
    console.log(`[OpenRouter] Calling ${model}...`);
    const { release, limiter } = await rateLimit(apiKey || 'openrouter');
    try {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const body = { 
            model, 
            messages: [{ role: 'user', content: prompt }],
            headers: {
                "HTTP-Referer": "https://memtrace.ai",
                "X-Title": "MemTrace Decision Engine"
            }
        };
        if (temperature !== undefined) body.temperature = temperature;
        const r = await withBackoff(() => fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify(body),
            signal
        }), 3, 1000, signal);
        if (!r.ok) {
            if (r.status === 429 && limiter) {
                const retryAfter = r.headers.get('retry-after');
                if (retryAfter) limiter.onRateLimited(parseInt(retryAfter) * 1000);
            }
            throw new Error(`OpenRouter: ${r.status} ${await r.text()}`);
        }
        const j = await r.json();
        return j.choices?.[0]?.message?.content?.trim() ?? '';
    } finally {
        release();
    }
}

/* -----------------------------------------------------------------
   LOCAL LLM CLIENT
   ----------------------------------------------------------------- */
export async function callLocalLLM(prompt, signal = undefined) {
    try {
        const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
        const lowerPrompt = cleanPrompt.toLowerCase();
        if (lowerPrompt === 'localllm' || lowerPrompt === 'local llm' || lowerPrompt === 'local_llm') {
            console.log(`[LocalLLM] Intercepted informational query "${cleanPrompt}". Returning local config documentation.`);
            return JSON.stringify({
                status: "active",
                provider: "localllm",
                model: DEFAULT_CONFIG.llm_model,
                max_tokens: DEFAULT_CONFIG.max_tokens || 1024,
                documentation: "Local LLM is running in single-threaded CPU mode using node-llama-cpp on Node and wllama on Browser. Model path is configured in extension/env/config.js. Concurrency is limited to 1 via a Semaphore to prevent thrashing KV cache."
            });
        }

        // If running in the browser (extension iframe), delegate to the backend
        // to prevent downloading the 4GB model into the browser cache.
        if (typeof window !== 'undefined' && typeof process === 'undefined') {
            console.log('[LocalLLM] Delegating local model request to backend /v1/chat...');
            const r = await fetch('/v1/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, max_tokens: DEFAULT_CONFIG.max_tokens || 1024 }),
                signal
            });
            if (!r.ok) throw new Error(`Backend LLM failed: ${r.statusText}`);
            const j = await r.json();
            return j.text;
        }

        // Server-side fallback for headless environments
        const { release } = await rateLimit('localllm');
        try {
            const { getOfflineLLM } = await import('./offline_llm.js');
            const offlineLLM = await getOfflineLLM();
            return await offlineLLM.generate(prompt, signal);
        } finally {
            release();
        }
    } catch (err) {
        console.error('Local LLM generation failed:', err);
        throw err;
    }
}
