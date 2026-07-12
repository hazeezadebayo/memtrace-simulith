/* ==================================================================
   core/chunker.js
   Native Chunking Logic (Performance Optimization)
   Uses Intl.Segmenter for sentence splitting + Sliding Window
   ================================================================== */

export async function chunkAndRefine(text, options = {}) {
    const { maxWords = 700, overlap = 0.15 } = options;
    if (!text || !text.trim()) return [];

    // 1. Chunk Text (Intl.Segmenter + Overlap)
    const chunks = chunkText(text, maxWords, overlap);

    // 2. Wrap in object structure (parity with legacy)
    // Legacy refineBoundary is deprecated/removed for speed.
    return chunks.map((c, i) => ({
        index: i,
        chunk: c.trim(), // No LLM refinement, just trim
        original: c,
        chunk_word_count: c.trim().split(/\s+/).length
    }));
}

export function chunkText(text, maxWords = 300, overlap = 0.15) {
    // 1. Split by sentences (locale-aware)
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const sentences = Array.from(segmenter.segment(text)).map(s => s.segment);

    const chunks = [];
    let currentChunk = [];
    let currentWordCount = 0;

    for (const sentence of sentences) {
        const wCount = sentence.split(/\s+/).length;

        // Check if adding this sentence exceeds strict limit
        // But we usually want to fill up to maxWords.
        // We'll accumulate until we exceed maxWords, then push.

        if (currentWordCount + wCount > maxWords && currentChunk.length > 0) {
            // Finalize current chunk
            const chunkStr = currentChunk.join('');
            chunks.push(chunkStr);

            // Sliding Window: Keep last N words for context
            const overlapCount = Math.floor(maxWords * overlap);
            let overlapBuffer = [];
            let overlapWords = 0;

            // Go backwards to fill overlap buffer
            for (let i = currentChunk.length - 1; i >= 0; i--) {
                const s = currentChunk[i];
                const sw = s.split(/\s+/).length;

                // Safety: If a single sentence is larger than the overlap target,
                // adding it would duplicate a huge chunk of text. 
                // We typically want context, but not 100% repetition of a huge block.
                // If overlapWords is 0 (buffer empty), we usually take at least one sentence.
                // BUT if that sentence is > overlapCount, we should skip it to avoid duplication?
                // If we skip it, we have 0 overlap. 
                // Better to have 0 overlap than 500 words of duplication.
                if (sw > overlapCount) {
                    // Try to avoid adding massive sentences to overlap
                    if (overlapWords === 0) {
                        // If it's the very first candidate and it's too big, skip it entirely.
                        // This breaks continuity but prevents "double chunking".
                        break;
                    }
                }

                if (overlapWords + sw <= overlapCount) {
                    overlapBuffer.unshift(s);
                    overlapWords += sw;
                } else {
                    // If adding this sentence exceeds overlap count:
                    // If we haven't added anything yet, maybe add it if it's "close enough"?
                    // (e.g. within 1.2x). But strict is safer for preventing duplication.
                    // Strict limit: Break.
                    break;
                }
            }

            currentChunk = [...overlapBuffer];
            currentWordCount = overlapWords;
        }

        currentChunk.push(sentence);
        currentWordCount += wCount;
    }

    // Push final chunk
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(''));
    }

    return chunks;
}

// Deprecated / Legacy Placeholder
export async function refineBoundary_old(text) {
    return text;
}
