import { getEmbedding, cosineSimilarity } from '../../../extension/llm/embedding.js';

// Generic global cache for any embedding arrays requested
const globalEmbeddingsCache = {};

/**
 * Returns the best match for inputStr among targetArray using Xenova Cosine Similarity.
 */
export async function getBestCosineMatch(inputStr, targetArray, threshold = 0.4) {
  if (!inputStr || !targetArray || targetArray.length === 0) return null;
  const raw = String(inputStr).toLowerCase().trim();
  
  try {
    const inputEmb = await getEmbedding(raw, "xenova");
    if (!inputEmb) return null;

    let bestMatch = null;
    let bestScore = -1;

    for (const target of targetArray) {
      const tRaw = String(target).toLowerCase().trim();
      
      // Cache target embeddings dynamically
      if (!globalEmbeddingsCache[tRaw]) {
        const emb = await getEmbedding(tRaw, "xenova");
        if (emb) globalEmbeddingsCache[tRaw] = emb;
      }
      
      const targetEmb = globalEmbeddingsCache[tRaw];
      if (!targetEmb) continue;

      const score = cosineSimilarity(inputEmb, targetEmb);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = target;
      }
    }

    if (bestScore >= threshold) {
      return bestMatch;
    }
  } catch (e) {
    console.error("Cosine matching failed:", e);
  }
  
  return null;
}

import { CANONICAL_DOMAINS } from '../data/manifest.js';
export { CANONICAL_DOMAINS };

export async function normalizeToBranchDomain(domainStr) {
  if (!domainStr) return 'general';
  const raw = String(domainStr).toLowerCase().trim();
  
  if (CANONICAL_DOMAINS.includes(raw)) return raw;

  const match = await getBestCosineMatch(raw, CANONICAL_DOMAINS, 0.15);
  return match || 'general';
}
