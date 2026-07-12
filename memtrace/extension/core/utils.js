/* ==================================================================
   utils.js
   Shared Pure Logic (Node.js & Browser Safe)
   refactored from legacy helper.js to avoid duplication
   ================================================================== */
import { cosineSimilarity } from '../llm/embedding.js';
export { cosineSimilarity };

/* -----------------------------------------------------------------
   1. BASIC UTILITIES
   ----------------------------------------------------------------- */

/**
 * Simple word count based on whitespace splitting
 * @param {string} txt 
 * @returns {number}
 */
export function wordCount(txt) {
    return txt ? txt.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Heuristic token estimation (Safe for Node/Browser without Transformers)
 * @param {string} text 
 * @returns {number}
 */
export function estimateTokensHeuristic(text) {
    return text ? Math.ceil(text.length / 4) : 0;
}

/**
 * Check if URL is safe to inject/run content script on
 * @param {string} url 
 * @returns {boolean}
 */
export function isInjectableUrl(url) {
    if (!url) return false;
    const l = url.toLowerCase();
    return !(
        l.startsWith('chrome://') ||
        l.startsWith('chrome-extension://') ||
        l.startsWith('edge://') ||
        l.includes('chrome.google.com/webstore')
    );
}

/* -----------------------------------------------------------------
   3. GRAPH & TAG AGGREGATION
   ----------------------------------------------------------------- */

/**
 * Aggregates tags from all chunks in a reference to create reference-level tags
 * @param {object} thread 
 */
export function updateReferenceTags(thread) {
    if (!thread.references) return;

    thread.references.forEach(ref => {
        const tagMap = new Map();
        const total = ref.chunks.length;

        ref.chunks.forEach(ch => {
            // Handle aliasing or parsing
            let tags = ch.chunk_tags || ch.tags;
            if (typeof tags === 'string') tags = JSON.parse(tags);
            if (!Array.isArray(tags)) tags = [];

            tags.forEach(tag => {
                const key = tag.toLowerCase();
                const entry = tagMap.get(key) || { tag, count: 0 };
                entry.count++;
                tagMap.set(key, entry);
            });
        });

        ref.reference_tags = Array.from(tagMap.values())
            .map(t => ({
                tag: t.tag,
                count: t.count,
                score: Number((t.count / total).toFixed(2))
            }))
            .sort((a, b) => b.score - a.score);
    });
}

/**
 * Builds edge list for graph traversal based on similarity
 * @param {object} thread 
 * @param {number} threshold 
 */
// node_ref - e.g., "abc123:1700000000:5"
export function getChunkByRef(thread, node_ref) {
    if (!node_ref) return null;
    // We expect ID match. If legacy ID, might fail, but we move forward.
    for (const ref of thread.references) {
        const chunk = ref.chunks.find(ch => ch.id === node_ref);
        if (chunk) return chunk;
    }
    // Fallback?
    return null;
}

// ...

export function buildEdgeList(thread, threshold = 0.65) {
    if (!thread.references) return;

    const chunks = [];
    thread.references.forEach(ref => {
        ref.chunks.forEach(ch => {
            let emb = ch.embedding;
            if (typeof emb === 'string') emb = JSON.parse(emb);

            if (emb && Array.isArray(emb)) {
                // Use the UNIQUE ID assigned at creation
                const nodeId = ch.id || `${thread.uuid}:${ch.created_at || '0'}:${ch.index}`;
                chunks.push({
                    node_ref: nodeId,
                    embedding: emb,
                    chunk: ch,
                    ref
                });
            }
        });
    });
    // ... 
    for (let i = 0; i < chunks.length; i++) {
        for (let j = i + 1; j < chunks.length; j++) {
            const score = cosineSimilarity(chunks[i].embedding, chunks[j].embedding);
            if (score >= threshold) {
                const edge = { node_ref: chunks[j].node_ref, score: Number(score.toFixed(3)) };
                chunks[i].chunk.edge_list = chunks[i].chunk.edge_list || [];
                chunks[i].chunk.edge_list.push(edge);

                chunks[j].chunk.edge_list = chunks[j].chunk.edge_list || [];
                chunks[j].chunk.edge_list.push({ node_ref: chunks[i].node_ref, score: edge.score });
            }
        }
    }
}

/* -----------------------------------------------------------------
   4. LOOKUP HELPERS
   ----------------------------------------------------------------- */

// href - The reference URL (e.g., "https://example.com/page") 
export function getReferenceByHref(thread, href) {
    if (!thread?.references) return null;
    return thread.references.find(ref => ref.reference === href) || null;
}

// tag - e.g., "audio" 
export function getChunksByTag(thread, tag) {
    const lowerTag = tag.toLowerCase();
    const results = [];

    for (const ref of thread.references) {
        for (const chunk of ref.chunks) {
            let tags = chunk.chunk_tags || chunk.tags || [];
            if (tags.some(t => t.toLowerCase() === lowerTag)) {
                results.push({ chunk, reference: ref });
            }
        }
    }
    return results;
}

// tag
export function getReferencesByTag(thread, tag) {
    const lowerTag = tag.toLowerCase();
    return thread.references.filter(ref =>
        ref.reference_tags?.some(t => t.tag.toLowerCase() === lowerTag)
    );
}

/* -----------------------------------------------------------------
   5. GRAPH TRAVERSAL
   ----------------------------------------------------------------- */

export function getConnectedChunks(thread, startChunk, maxDepth = 2) {
    const visited = new Set();
    const queue = [{ chunk: startChunk, score: 1.0, depth: 0, path: [] }];
    const results = [];

    while (queue.length > 0) {
        const { chunk, score, depth, path } = queue.shift();
        const node_ref = chunk.id; // Use implicit ID

        if (visited.has(node_ref)) continue;
        visited.add(node_ref);

        results.push({ chunk, score, path: [...path, node_ref] });

        if (depth >= maxDepth) continue;

        for (const edge of chunk.edge_list || []) {
            const neighbor = getChunkByRef(thread, edge.node_ref);
            if (neighbor && !visited.has(edge.node_ref)) {
                queue.push({
                    chunk: neighbor,
                    score: score * edge.score,
                    depth: depth + 1,
                    path: [...path, node_ref]
                });
            }
        }
    }

    // Sort by final score
    return results.sort((a, b) => b.score - a.score);
}
