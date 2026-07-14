/* ==================================================================
   helper.js
   Browser-Specific Utilities + Shared Logic
   Restored and refactored to use extension/core/utils.js
   ================================================================== */

import * as Utils from './utils.js';

// Environment detection
const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

// Helper to get Transformers module
async function getTransformers() {
    if (IS_NODE) {
        return await import('@xenova/transformers');
    }
    return await import('../utils/transformers.min.js'); // Relative import for browser bundle
}

// initialize tokenizer weights
let token_encoder = null;

// Re-export shared utilities for popup.js convenience
export * from './utils.js';

/* -----------------------------------------------------------------
    UNIVERSAL MODULE LOADER (Browser vs Node)
   ----------------------------------------------------------------- */

/* -----------------------------------------------------------------
   1. XENOVA ENV SETUP
   ----------------------------------------------------------------- */
// this function is called once when the extension popup loads,
// *before* any calls to getEmbedding or estimateTokens.
export async function setupXenovaEnv() {
    try {
        const { env } = await getTransformers(); // Use dynamic loader

        if (!IS_NODE) {
            // === BROWSER (Extension) CONFIG ===
            if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
                console.log('[Xenova] Running in browser context without chrome API — skipping extension-specific env setup.');
                return;
            }
            // Point to extension's local utils folder
            env.localModelPath = chrome.runtime.getURL('utils/');
            env.allowLocalModels = true;
            env.allowRemoteModels = false;
            env.useBrowserCache = false;

            // Fixes for browser execution
            env.worker = false;
            env.backends.onnx.wasm.numThreads = 1;
            env.load_in_main_thread = true;
            env.backends.onnx.executionProviders = ['wasm'];
        } else {
            // === NODE (API) CONFIG ===
            // Defaults are usually fine for Node, but we can be explicit
            env.allowLocalModels = false; // Let it download to cache by default
            env.useBrowserCache = false;
        }

        console.log(`✅ Xenova environment configured (${IS_NODE ? 'Node' : 'Browser'}).`);
    } catch (e) {
        console.error("⚠️ Failed to set up Xenova env", e);
    }
}

/* -----------------------------------------------------------------
   2. ESTIMATE TOKENS (Browser / Transformers.js Version)
   ----------------------------------------------------------------- */
// Estimates token count for a given text using Xenova GPT2 tokenizer.
// Falls back to length/4 heuristic if tokenizer fails.
export async function estimateTokens(text) {
    if (!text) return 0;

    try {
        // Load tokenizer once
        if (!token_encoder) {
            console.log("🚀 Loading tokenizer (all-MiniLM-L6-v2)...");
            const { AutoTokenizer } = await getTransformers();

            // Config based on env
            const config = IS_NODE ?
                { quantized: false } : // Node: standard remote load
                { quantized: false, local_files_only: true }; // Browser: strict local

            token_encoder = await AutoTokenizer.from_pretrained(
                'Xenova/all-MiniLM-L6-v2',
                config
            );
            console.log("✅ Xenova Tokenizer ready!");
        }
        // Encode text and count tokens
        const tokens = await token_encoder.encode(text);
        return tokens.length;
    } catch (err) {
        console.log("⚠️ Tokenizer failed, using heuristic fallback:", err);
        return Utils.estimateTokensHeuristic(text);
        // return text ? Math.ceil(text.length / 4) : 0;
    }
}

/* -----------------------------------------------------------------
   3. DEVICE & URL HELPERS
   ----------------------------------------------------------------- */
export async function getDeviceUUID() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            if (data.uuid) {
                // Keep local storage in sync
                if (window.chrome && window.chrome.storage) {
                    await window.chrome.storage.local.set({ deviceUUID: data.uuid });
                } else if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('deviceUUID', data.uuid);
                }
                return data.uuid;
            }
        }
    } catch (e) {
        console.warn('Could not fetch UUID from backend, falling back to local storage.');
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const { deviceUUID } = await chrome.storage.local.get('deviceUUID');
        if (deviceUUID) return deviceUUID;
        const newId = crypto.randomUUID();
        await chrome.storage.local.set({ deviceUUID: newId });
        return newId;
    } else {
        let deviceUUID = localStorage.getItem('deviceUUID');
        if (!deviceUUID) {
            deviceUUID = crypto.randomUUID();
            localStorage.setItem('deviceUUID', deviceUUID);
        }
        return deviceUUID;
    }
}

/* -----------------------------------------------------------------
   4. INJECT + SEND MESSAGE (used by popup)
   ----------------------------------------------------------------- */
export function sendMessageToTabWithInject(tabId, msg) {
    return new Promise((resolve) => {
        const handler = (resp) => {
            if (!chrome.runtime.lastError) { resolve(resp); return; }
            const errMsg = chrome.runtime.lastError.message || '';
            if (errMsg.includes('Receiving end does not exist')) {
                chrome.scripting.executeScript(
                    { target: { tabId }, files: ['content.js'] },
                    () => {
                        if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
                        else chrome.tabs.sendMessage(tabId, msg, handler);
                    }
                );
            } else resolve({ success: false, error: errMsg });
        };
        chrome.tabs.sendMessage(tabId, msg, handler);
    });
}

/* -----------------------------------------------------------------
   5. CLIPBOARD & DOWNLOAD
   ----------------------------------------------------------------- */
export async function copyToClipboard(txt) {
    await navigator.clipboard.writeText(txt);
}

export function downloadJson(data, filename = 'memtrace.json') {
    const payload = JSON.stringify(data, null, 2);
    chrome.runtime.sendMessage({ action: 'download', filename, log: payload }, (resp) => {
        resp?.success ? console.log('Downloaded:', resp.downloadId) : console.error('Download failed:', resp?.error);
    });
}


/* -----------------------------------------------------------------
   6. IMAGIFY CHUNK (for export)
   ----------------------------------------------------------------- */
export async function imagifyChunk(chunk, w = 640, h = 800) {
    const words = chunk.replace(/\t/g, ' ').replace(/\r\n/g, '\n').split(/\s+/).filter(Boolean);
    if (!words.length) return [];

    const lineH = 18, font = '14px Arial', maxW = w - 20, maxLines = Math.floor((h - 20) / lineH);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const slices = []; let i = 0;

    while (i < words.length) {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.font = font; ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
        let y = 10, lines = 0, line = '', used = 0;

        for (; i < words.length; i++) {
            const test = line ? line + ' ' + words[i] : words[i];
            if (ctx.measureText(test).width > maxW && line) {
                ctx.fillText(line, 10, y); y += lineH; lines++; line = words[i];
                if (lines >= maxLines) break;
            } else {
                line = test; used++;
            }
        }
        if (line && lines < maxLines) ctx.fillText(line, 10, y);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.15);
        slices.push({ dataUrl, wordsUsed: used });
        i += used;
    }
    return slices;
}