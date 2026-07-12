/* ==================================================================
   llm/qwen_embedding_api_adapter.js
   Isolated Embedding Wrapper for Qwen DashScope API
   ================================================================== */
import { rateLimit, withBackoff } from '../core/llm-limiter.js';
import { DEFAULT_CONFIG } from '../env/config.js';

/**
 * Isolated call to Qwen's DashScope text-embedding API.
 * Maps output to the expected [number] array format.
 */
export async function getQwenEmbedding(text, apiKey, model = null) {
    if (!text) return null;

    // dashscopeApiKey if provided, else fallback to standard apiKey in config
    const effectiveKey = apiKey || DEFAULT_CONFIG.apiKey;

    const { release, limiter } = await rateLimit('qwen_embed');
    try {
        const m = model || "text-embedding-v4";
        const url = "https://dashscope-intl.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding";

        const body = {
            model: m,
            input: { texts: [text] }
        };

        const resp = await withBackoff(() => fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${effectiveKey}`
            },
            body: JSON.stringify(body)
        }), 3, 1000);

        if (!resp.ok) {
            if (resp.status === 429 && limiter) {
                const retryAfter = resp.headers.get('retry-after');
                if (retryAfter) limiter.onRateLimited(parseInt(retryAfter) * 1000);
            }
            throw new Error(`Qwen Embedding Error: ${resp.status} ${await resp.text()}`);
        }

        const j = await resp.json();

        const embeddingArray = j.output?.embeddings?.[0]?.embedding;
        if (!embeddingArray || !Array.isArray(embeddingArray)) {
            throw new Error("Invalid Qwen embedding format received");
        }

        return embeddingArray;
    } finally {
        release();
    }
}
