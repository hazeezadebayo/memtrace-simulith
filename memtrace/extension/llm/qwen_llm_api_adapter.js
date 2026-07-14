/* ==================================================================
   llm/qwen_llm_api_adapter.js
   Isolated LLM Wrapper for Qwen DashScope API
   ================================================================== */
import { rateLimit, withBackoff } from '../core/llm-limiter.js';
import { DEFAULT_CONFIG } from '../env/config.js';

/**
 * Isolated call to Qwen's DashScope text-generation API.
 * Uses the compatible chat/completions endpoint.
 */
export async function callQwen(apiKey, prompt, model = 'qwen-turbo', temperature = undefined, signal = undefined, systemMsg = undefined) {
    console.log(`[Qwen Adapter] Calling ${model}...`);

    // dashscopeApiKey if provided, else fallback to standard apiKey in config
    const effectiveKey = apiKey || DEFAULT_CONFIG.apiKey;

    const { release, limiter } = await rateLimit('qwen');
    try {
        const url = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
        const messages = systemMsg ? [{ role: 'system', content: systemMsg }, { role: 'user', content: prompt }] : [{ role: 'user', content: prompt }];
        const body = {
            model: model,
            messages,
            enable_thinking: true
        };

        if (temperature !== undefined) {
            body.temperature = temperature;
        }

        const r = await withBackoff(async () => {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${effectiveKey}`
                },
                body: JSON.stringify(body),
                signal
            });
            if (!res.ok) {
                if (res.status === 429 && limiter) {
                    const retryAfter = res.headers.get('retry-after');
                    if (retryAfter) limiter.onRateLimited(parseInt(retryAfter) * 1000);
                }
                throw new Error(`Qwen API Error: ${res.status} ${await res.text()}`);
            }
            return res;
        }, 3, 1000, signal);

        const j = await r.json();
        return j.choices?.[0]?.message?.content?.trim() ?? '';
    } finally {
        release();
    }
}
