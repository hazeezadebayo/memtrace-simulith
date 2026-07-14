/* ==================================================================
   llm/embedding.js
   Embedding Client (OpenAI, Gemini, Xenova, Custom)
   ================================================================== */
import { rateLimit, withBackoff } from '../core/llm-limiter.js';

// initialize embedder weights
let xenovaExtractor = null;

// Environment detection
const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

async function getTransformers() {
    if (IS_NODE) {
        return await import('@xenova/transformers');
    }
    // Browser import
    return await import('../utils/transformers.min.js');
}

// === MAIN EMBEDDING FUNCTION ===
export async function getEmbedding(text, provider = "xenova", apiKey, model = null) {
    if (!text) return null;
    const { release, limiter } = await rateLimit(apiKey || provider);

    try {
        // ------- LET ME COOK --------

        // ---------- OPENAI ----------
        if (provider === "openai") {
            const m = model || "text-embedding-3-small";
            const resp = await withBackoff(() => fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({ input: text, model: m })
            }));
            if (!resp.ok) {
                if (resp.status === 429 && limiter) {
                    const retryAfter = resp.headers.get('retry-after');
                    if (retryAfter) limiter.onRateLimited(parseInt(retryAfter) * 1000);
                }
                throw new Error(await resp.text());
            }
            const j = await resp.json();
            if (!j.data?.[0]?.embedding) throw new Error("Invalid OpenAI embedding");
            return j.data[0].embedding;
        }

        // ---------- GEMINI ----------
        if (provider === "gemini") {
            const url = `https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=${encodeURIComponent(apiKey)}`;
            const body = {
                model: 'embedding-001',
                content: { parts: [{ text: text }], role: 'user' },
                taskType: 'SEMANTIC_SIMILARITY',
                outputDimensionality: 768
            };
            const resp = await withBackoff(() => fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }));
            if (!resp.ok) {
                if (resp.status === 429 && limiter) {
                    const retryAfter = resp.headers.get('retry-after');
                    if (retryAfter) limiter.onRateLimited(parseInt(retryAfter) * 1000);
                }
                throw new Error(await resp.text());
            }
            const j = await resp.json();
            const values = j.embedding?.values;
            if (!values || !Array.isArray(values) || values.length === 0) {
                throw new Error('Invalid embedding response');
            }
            const mag = Math.sqrt(values.reduce((s, v) => s + v * v, 0) || 1);
            return values.map(v => v / mag);
        }

        // ---------- QWEN ----------
        if (provider === "qwen") {
            const { getQwenEmbedding } = await import('./qwen_embedding_api_adapter.js');
            return await getQwenEmbedding(text, apiKey, model);
        }

        // ---------- XENOVA ----------
        if (provider === "xenova" && process.env.SKIP_XENOVA === 'true') {
            throw new Error('Skipping xenova (SKIP_XENOVA is set)');
        }
        if (provider === "xenova") {
            // Load embedder once
            if (!xenovaExtractor) {
                console.log("🚀 Loading embedder (all-MiniLM-L6-v2)...");
                // We no longer need to set 'env' here, just import 'pipeline'
                const { pipeline } = await getTransformers();

                // Config: Node can use defaults/cache, Browser uses strict local
                const config = IS_NODE ?
                    { quantized: true } :
                    { quantized: true, local_files_only: true };

                // --- START: Use the simplified pipeline call ---
                xenovaExtractor = await pipeline(
                    'feature-extraction',
                    'Xenova/all-MiniLM-L6-v2',
                    config
                );
                console.log("✅ Xenova embedder ready.");
            }
            const output = await xenovaExtractor(text, { pooling: "mean", normalize: true });
            return Array.from(output.data);
        }

        // -------- DONE COOKING --------
    } catch (err) {
        console.log(`⚠️ ${provider} embedding failed — 🚨 falling back to custom:`, err.message);

        // ---------- CUSTOM ----------

        // inline custom fallback
        const dim = 128;
        const tokens = text
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 256);

        const vec = new Array(dim).fill(0);

        tokens.forEach((token, i) => {
            const subwords =
                token.length > 4 ? [token.slice(0, 3), token.slice(-3)] : [token];
            subwords.forEach((sub, j) => {
                const h = superHash(sub + i + j);
                const index = h % dim;
                const weight = 1 / (1 + i); // decay by position
                vec[index] += ((h % 100) / 100) * weight;
            });
        });

        // Normalize vector
        const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
        return vec.map(v => v / mag);

    } finally {
        release();
    }
}

export function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
        console.log("Vectors must be non-empty arrays of equal length.");
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(-1, Math.min(1, similarity));
}

function superHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
