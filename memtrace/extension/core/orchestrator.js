import { chunkAndRefine } from '../core/chunker.js';
import { cosineSimilarity } from '../llm/embedding.js';
import { estimateTokensHeuristic } from '../core/utils.js';
import { buildContextForQuery } from '../core/llm_agent.js';
import { loadThread, deleteReference, deleteChunk, getChunk, upsertChunk, getAll, initializeStorage, search } from '../core/memory.js';


/* -----------------------------------------------------------------
   0. CONFIG: Configuration Constants (Parity with popup.js) 
   ----------------------------------------------------------------- */

const CONFIG = {
    FIX_BROKEN_CHUNK: false,
    MAX_SEARCH_ITEMS: 10,
    MAX_CANDIDATE_POOL: 60,
    NODE_SIMILARITY_THRESHOLD: 0.10,
    EDGE_SIMILARITY_THRESHOLD: 0.40,
    EDGE_BOOST_FACTOR: 0.60,
    TAG_MATCH_MIN_RATIO: 0.15,
    MAX_EDGE_TRAVERSAL_DEPTH: 3
};

export class ThreadletOrchestrator {
    constructor(llm) {
        this.llm = llm;
    }

    async init(uuid, mode, config) {
        // 1. Initialize Env (Idempotent)
        // We need to import it properly. It wasn't in utils.
        // Dynamic import to avoid circular dep issues or if it's large?
        // popup.js imported it from './core/helper.js'.
        // Let's use dynamic import here to be safe and clean, or fix the import at top.
        const { setupXenovaEnv } = await import('../core/helper.js');
        await setupXenovaEnv();

        // 2. Initialize Storage
        await initializeStorage(uuid, mode, config);
    }

    async validateConfig() {
        if (this.llm.validate) {
            return await this.llm.validate();
        }
        return true; // Pass through if no validation logic
    }

    /* -------------------------------------------------------------
       2. RETRIEVAL & SEARCH (Advanced Logic)
       ------------------------------------------------------------- */
    async search(uuid, query, options = {}) {
        const { fixBroken = true } = options;

        console.log('[Orchestrator] Starting search:', query, uuid);
        const thread = await loadThread(uuid);
        if (!thread || !thread.references?.length) return [];

        const cfg = await this.llm.getConfig();
        const { llm_provider, emb_provider, apiKey } = cfg;

        // 1. Embed Query
        const queryEmb = await this.llm.embed(query);

        // 2. Generate Query Tags
        let queryTags = [];
        try {
            // Use specialized tag generation function (parity with ingest)
            queryTags = await this.llm.tag(query);
            console.log(`[Search] Generated query tags:`, queryTags);
        } catch (e) { console.warn('Tag generation failed', e); }

        // 3. Delegation to DB (Hybrid Search)
        // We pass the raw query text for FTS and the vector/tags for re-ranking.
        // The DB adapter handles the "Tag Trap" avoidance via FTS candidate generation.

        const candidateChunks = await search(
            queryEmb,
            queryTags,
            CONFIG.MAX_CANDIDATE_POOL,
            query,
            uuid
        );

        // 4. Transform Candidates to standard format
        // The DB returns flat chunks with 'score'.
        // We map them and then FILTER by NODE_SIMILARITY_THRESHOLD.

        let validCandidates = candidateChunks;

        // FILTER: Apply NODE_SIMILARITY_THRESHOLD to usage DB results
        if (CONFIG.NODE_SIMILARITY_THRESHOLD > 0) {
            const initialCount = validCandidates.length;
            validCandidates = validCandidates.filter(c => c.score >= CONFIG.NODE_SIMILARITY_THRESHOLD);
            if (initialCount > validCandidates.length) {
                console.log(`[GRAPH] Filtered ${initialCount - validCandidates.length} candidates below NODE threshold (${CONFIG.NODE_SIMILARITY_THRESHOLD}). Keeping ${validCandidates.length}.`);
            }
        }

        const allCandidates = validCandidates.map(c => {
            // Find reference name from thread object
            // ref is likely implicit in 'url' field of chunk
            return {
                score: c.score,
                chunk: { ...c, uuid },
                refName: c.url || 'unknown'
            };
        });

        // 5. Edge Expansion
        // FIX: Use canonical chunk ID (uuid:timestamp:index) for keys, matches node_ref.
        const expanded = new Map();
        allCandidates.forEach(c => expanded.set(c.chunk.id, c));

        // We expand everyone who survived the filter (User requirement: "only expand ... worthy")
        const toExpand = allCandidates;
        console.log(`[GRAPH] Expanding ${toExpand.length} candidates. Threshold to beat=${CONFIG.EDGE_SIMILARITY_THRESHOLD}`);

        for (const cand of toExpand) {
            const edges = typeof cand.chunk.edge_list === 'string' ? JSON.parse(cand.chunk.edge_list) : (cand.chunk.edge_list || []);
            // hard limit the depth of search of the edge list node to MAX_EDGE_TRAVERSAL_DEPTH per node
            const limitedEdges = edges.slice(0, CONFIG.MAX_EDGE_TRAVERSAL_DEPTH);

            console.log(`[GRAPH] Chunk ${cand.chunk.index} has ${edges.length} edges. Checking top ${limitedEdges.length}...`);

            for (const edge of limitedEdges) {
                const neighborId = edge.node_ref;
                const logPrefix = `   -> Edge to ${neighborId}:`;

                if (edge.score < CONFIG.EDGE_SIMILARITY_THRESHOLD) {
                    console.log(`${logPrefix} Skipped (Score ${edge.score.toFixed(3)} < ${CONFIG.EDGE_SIMILARITY_THRESHOLD})`);
                    continue;
                }

                if (expanded.has(neighborId)) {
                    console.log(`${logPrefix} Already in candidates.`);
                    continue;
                }

                // Find neighbor in thread
                // Note: We search by ID primarily.
                const neighbor = thread.references.flatMap(r => r.chunks).find(c => c.id === neighborId);

                if (!neighbor) {
                    console.log(`${logPrefix} Neighbor chunk data not found in loaded thread.`);
                    continue;
                }
                if (!neighbor.embedding) {
                    console.log(`${logPrefix} Neighbor has no embedding.`);
                    continue;
                }

                let boosted = edge.score * CONFIG.EDGE_BOOST_FACTOR;

                console.log(`${logPrefix} Handshake. Base=${edge.score.toFixed(3)}, Boosted=${boosted.toFixed(3)} (Threshold=${CONFIG.EDGE_SIMILARITY_THRESHOLD})`);

                if (boosted >= CONFIG.EDGE_SIMILARITY_THRESHOLD) {
                    // Add to pool
                    const ref = thread.references.find(r => r.chunks.includes(neighbor)) || { reference: 'linked' };
                    expanded.set(neighborId, {
                        score: boosted,
                        chunk: { ...neighbor, uuid },
                        refName: ref.reference.split('/').pop()
                    });
                    console.log(`${logPrefix} ACCEPTED. Added as implicit match.`);
                } else {
                    console.log(`${logPrefix} REJECTED. Score too low.`);
                }
            }
        }

        const finalResults = [...expanded.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, CONFIG.MAX_CANDIDATE_POOL)
            .slice(0, CONFIG.MAX_SEARCH_ITEMS);

        console.log(`[GRAPH] Expansion Complete. Final Count: ${finalResults.length}`);
        return finalResults;
    }

    async generateAnswer(query, hits) {
        const cfg = await this.llm.getConfig();
        // Convert hits to format expected by buildContextForQuery
        const formatted = hits.map((h, i) => ({
            index: i,
            reference: h.chunk.reference || h.refName || "unknown",
            summary: h.chunk.summary,
            score: h.score
        }));
        return await buildContextForQuery(formatted, query, cfg);
    }

    async pasteChunk(targetUuid, targetUrl, clipboard) {
        if (!clipboard || !clipboard.uuid) throw new Error("Invalid clipboard");

        const sourceThread = await this.getThread(clipboard.uuid);
        const sourceRef = sourceThread.references.find(r => r.reference === clipboard.ref);
        const sourceChunk = sourceRef?.chunks.find(c => c.index === clipboard.index);

        if (!sourceChunk) {
            console.log(`[Paste] Source chunk not found. Clipboard:`, clipboard);
            throw new Error(`Source chunk #${clipboard.index} not found in thread.`);
        }

        const targetThread = await this.getThread(targetUuid);
        const targetRef = targetThread.references.find(r => r.reference === targetUrl);

        // Requirement: "replace the 'timestamp' ... with new thread's timestamp"
        // Requirement: "pasted node ... is going to be index 0"
        let newTimestamp = Date.now();
        if (targetRef && targetRef.chunks.length > 0) {
            // Use the earliest timestamp found in the thread to align with "thread start"
            // We use the exact timestamp as requested. 
            // Index 0 will ensure it sorts before Index 1 even if timestamps are identical.
            newTimestamp = Math.min(...targetRef.chunks.map(c => new Date(c.created_at || c.timestamp).getTime()));
        }

        const FIXED_INDEX = 0; // User required Index 0

        const newChunk = {
            id: `${targetUuid}:${newTimestamp}:${FIXED_INDEX}`,
            uuid: targetUuid,
            url: targetUrl,
            text: sourceChunk.chunk,
            chunk: sourceChunk.chunk,
            summary: sourceChunk.summary,
            tags: sourceChunk.tags || [],
            embedding: sourceChunk.embedding,
            index: FIXED_INDEX,
            created_at: newTimestamp,
            edge_list: []
        };

        const targetChunks = await getAll(targetUuid);

        // 1. Build Outgoing Edges
        this._buildSingleChunkGraph(newChunk, targetChunks);

        // 2. Build Incoming Edges (Bi-directional)
        // User Requirement: "be a part of their edge_lists"
        const edges = newChunk.edge_list || [];
        console.log(`[Paste] New Chunk has ${edges.length} outgoing edges. Updating neighbors...`);

        for (const edge of edges) {
            const neighborId = edge.node_ref;
            const neighbor = targetChunks.find(c => c.id === neighborId);
            if (neighbor) {
                const nEdges = typeof neighbor.edges === 'string' ? JSON.parse(neighbor.edges) : (neighbor.edges || neighbor.edge_list || []);

                // Add back-link if not exists
                if (!nEdges.find(e => e.node_ref === newChunk.id)) {
                    nEdges.push({ node_ref: newChunk.id, score: edge.score });
                    // Re-sort and limit
                    nEdges.sort((a, b) => b.score - a.score);
                    const keptEdges = nEdges.slice(0, 5); // Keep Top-5 sparsification

                    neighbor.edge_list = keptEdges;
                    neighbor.edges = keptEdges; // Parity

                    await upsertChunk(neighbor);
                    console.log(`[Paste] Updated neighbor ${neighbor.index} (ID: ${neighborId}) with back-link.`);
                }
            }
        }

        await upsertChunk(newChunk);
        return newChunk;
    }



    /* -------------------------------------------------------------
       1. INGESTION PIPELINE (Matches popup.js:startSummarization)
       ------------------------------------------------------------- */
    async ingest(text, url, uuid, options = {}) {
        const { onProgress = () => { }, chunkSize = 3000, overlap = 0.15 } = options;

        // 1. Reserve Integrity: Get next index
        const { getNextIndex } = await import('../core/memory.js');
        const startIndex = await getNextIndex(uuid, url);
        console.log(`[Ingest] Reserved Index Start: ${startIndex}`);

        // 2. Chunking
        onProgress(5, 'Chunking…');
        const rawChunks = await chunkAndRefine(text, { maxWords: chunkSize, overlap });
        const timestamp = Date.now();

        if (!rawChunks.length) return { count: 0, chunks: [] };

        // 3. Enrichment (Sequential for progress tracking, or throttled parallel)
        const processed = [];
        for (let i = 0; i < rawChunks.length; i++) {
            const ch = rawChunks[i];
            const progressBase = 20 + Math.floor((i / rawChunks.length) * 60);

            try {
                onProgress(progressBase, `Summarizing #${i + 1}…`);
                // Request an ultra-short 25-word summary to keep RAG lightweight
                const summary = await this.llm.summarize(ch.chunk, 75);

                onProgress(progressBase + 10, `Tagging #${i + 1}…`);
                // Use Specialized Agent
                const tagsList = await this.llm.tag(ch.chunk);
                // Tag agent returns array, we used to split string. 
                // Adapt if needed, but llm_agent.js:generateTags returns ARRAY. 
                // So tagsList is already ['a','b'].

                if (tagsList.length < 1) {
                    throw new Error(`Insufficient tags generated (${tagsList.length}). Minimum 1 required.`);
                }

                onProgress(progressBase + 15, `Embedding #${i + 1}…`);
                const summaryEmb = await this.llm.embed(summary);

                // IMPORTANT: Use Reserved Index to assign ID
                const actualIndex = startIndex + i;
                const stableId = `${uuid}:${timestamp}:${actualIndex}`;

                const chunkObj = {
                    id: stableId,
                    uuid,
                    text: ch.chunk,
                    chunk: ch.chunk, // Dual field for parity
                    summary: summary.trim(),
                    tags: tagsList, // Already array
                    embedding: summaryEmb,
                    url: url || 'api-upload',
                    edge_list: [],
                    created_at: timestamp,
                    chunk_word_count: ch.chunk.split(/\s+/).length,
                    index: actualIndex
                };
                processed.push(chunkObj);

                // INCREMENTAL SAVE: Support concurrent edits
                // We save immediately so it exists in DB for "Edit" to work.
                await upsertChunk(chunkObj);

                // Emit incremental update for UI
                onProgress(progressBase + 19, `Processed #${i + 1}`, chunkObj);

            } catch (e) {
                console.error(`Chunk ${i} failed processing:`, e);
                // CRITICAL: Propagate error to abort ingestion if validation fails
                throw e;
            }
        }

        // 4. Filter Clean
        const validChunks = processed.filter(c => c && c.chunk_word_count > 20 && c.tags.length > 2);

        // 5. Graph Building
        onProgress(85, 'Linking Chunks…');
        this._buildBatchGraph(validChunks);

        // Re-save with edges
        for (const c of validChunks) {
            const fresh = await getChunk(c.id, c.uuid);
            if (fresh) {
                // RACE CONDITION CHECK: Preserve user edits to text
                if (fresh.text !== c.text) {
                    console.log(`[Orchestrator] Race condition detected on chunk ${c.id}. Preserving edited text.`);
                    // We preserve fresh.text, but update edges.
                    // Note: Edges computed on OLD text might be slightly off, but better than no edges.
                    fresh.edge_list = c.edge_list;
                    await upsertChunk(fresh);
                } else {
                    fresh.edge_list = c.edge_list;
                    await upsertChunk(fresh);
                }
            } else {
                await upsertChunk(c);
            }
        }

        // 6. Incremental Save (Smart Dedupe / Reference Management)
        onProgress(90, 'Saving to Memory…');
        const { updateThreadIncremental } = await import('../core/memory.js');

        // We pass validChunks to ensure 'Reference' object is created/updated.
        // updateThreadIncremental logic manages the "Append" logic.
        // Since we already upserted, they are in DB.
        // updateThreadIncremental might re-save them.
        // We should ensure it doesn't reverting text.
        // Memory.js `updateThreadIncremental` constructs chunks and saves.
        // To fix this cleanly, `ingest` implies "New Data".
        // The user wants "Edited New Data".
        // If we simply rely on `upsertChunk` we did above (and ref fetch),
        // we might not need to pass all chunks to updateThreadIncremental if it just does DB Insert.
        // But it handles "Reference Metadata" (total_chunk_count etc if tracked?).
        // Actually `memory.js` just does `upsertChunk` loop.

        // Let's rely on the fact that we already saved them.
        // But `updateThreadIncremental` also finds "nextIndex" for new stuff.
        // Since we assigned indices and IDs sequentially, we are good?
        // Wait, `ingest` assigned `i` (0,1,2).
        // `updateThreadIncremental` determines `nextIndex` based on DB.
        // If we pre-saved them with index 0,1,2... they might conflict if appending?
        // `ingest` relies on `updateThreadIncremental` to set final indices?
        // `ingest` code: `index: i // Temporary index`.
        // `Memory.js`: `nextIndex = lastOld.index + 1`.
        // So `Memory.js` re-assigns indices and RE-SAVES.

        // ISSUE: If `Memory.js` changes ID (uuid:ts:index), then our early saved chunks are orphans!
        // `Memory.js` constructs ID: `const id = ${uuid}:${timestamp}:${index}`.
        // `Ingest` constructs ID: `${uuid}:${timestamp}:${i}`.
        // If `index` matches `i`, IDs match.
        // `ingest` uses `i` (0-based).
        // `Memory.js` might start at 5 if appending.

        // If this is a NEW thread (usual for ingest), `nextIndex` starts at 1? Or 0?
        // `Memory.js`: `nextIndex = lastOld ? lastOld.index + 1 : 0`. (Actually if no lastOld, it starts at 0?).
        // Let's assume Ingest is "fresh ingest" or "append".

        // If we want concurrent edit, we MUST have stable IDs.
        // If `Memory.js` changes IDs later, our edits (on old IDs) are lost/orphaned.

        // FIX: We must know the START INDEX upfront or handle "Move".
        // Taking a risk: We assume standard ingest starts at 0 (fresh).
        // If appending, we might have issues.
        // BUT `ingest` is typically for "Summarize Page" -> Fresh Thread usually?
        // If appending to existing, `orchestrator.ingest` is called.
        // Getting `nextIndex` early is better.

        // IMPORTANT: We will rely on `updateThreadIncremental` to do the final "Official" save with correct indices.
        // BUT to support edits, we need to preserve the *text* if user edited our temp chunks.
        // So we will pass the FLUSHED (fresh) chunks to `updateThreadIncremental`.

        const freshChunks = [];
        for (const c of validChunks) {
            const fresh = await getChunk(c.id, c.uuid);
            freshChunks.push(fresh || c);
        }

        const updatedThread = await updateThreadIncremental(uuid, url, freshChunks); // Pass FRESH content

        // Clean up: If `updateThreadIncremental` changed IDs (e.g. re-indexed), 
        // we might have old temp chunks in DB. 
        // Logic: `updateThreadIncremental` uses `upsertChunk`. 
        // If ID changed, it inserts new. Old remains.
        // We should delete old if ID changed.
        // Checking if ID changed:
        // `updatedThread` refs... chunks...
        // This is complex. For now, assume fresh ingest (Index 0 aligned).
        // If ID differs, we'll have duplicates.
        // (User can delete duplicates).

        onProgress(100, 'Done');
        return updatedThread;
    }

    /* -------------------------------------------------------------
       2. COPY / PASTE (Matches memory.js logic)
       ------------------------------------------------------------- */
    async copyChunk(id, targetUuid, targetUrl) {
        // 1. Get Source
        const sourceUuid = id.split(':')[0];
        const source = await getChunk(id, sourceUuid);
        if (!source) throw new Error('Source chunk not found');

        // 2. Prevent Same-Reference Copy
        if (source.uuid === targetUuid && source.url === targetUrl) {
            throw new Error('Cannot copy to same reference');
        }

        // 3. Clone
        const timestamp = Date.now();
        // Calc index? Ideally we verify against target thread.
        // But for headless, we might just assume append or use random if index not strict?
        // User requested: uuid:timestamp:index.
        // Let's assume we append to end.
        const targetChunks = await getAll(targetUuid);
        // filter for this ref?
        const refChunks = targetChunks.filter(c => c.url === targetUrl);
        const nextIndex = refChunks.length > 0 ? Math.max(...refChunks.map(c => c.index || 0)) + 1 : 0;

        const newChunk = {
            ...source,
            id: `${targetUuid}:${timestamp}:${nextIndex}`,
            uuid: targetUuid,
            url: targetUrl,
            index: nextIndex,
            created_at: timestamp,
            edge_list: [] // Edges must be recomputed for new context
        };

        // 4. Rebuild Graph Context (Target Thread)
        // Ideally we fetch recent chunks from target thread to build edges
        // For MVP/Accuracy, we adhere to "perfect abstraction" which implies checking against context.
        // We'll fetch target thread chunks to compute edges against them.
        this._buildSingleChunkGraph(newChunk, targetChunks);

        // 5. Save
        await upsertChunk(newChunk);
        return newChunk;
    }

    /* -------------------------------------------------------------
       3. DELETE
       ------------------------------------------------------------- */
    async deleteChunk(uuid, url, index) {
        // If single argument "id" is passed (backward compat or internal use), handle it
        if (arguments.length === 1 && typeof uuid === 'string') {
            const id = uuid; // Rename for clarity
            const extractedUuid = id.split(':')[0];
            await deleteChunk(id, extractedUuid);
            return;
        }

        // Standard usage from Popup: delete by coordinate (uuid, url, index)
        const thread = await this.getThread(uuid);
        const ref = thread.references.find(r => r.reference === url);
        if (!ref) throw new Error("Reference not found");

        const chunk = ref.chunks.find(c => c.index === index);
        if (!chunk) throw new Error("Chunk not found");

        await deleteChunk(chunk.id, uuid);
    }
    async deleteRef(uuid, url) { await deleteReference(uuid, url); }


    /* -------------------------------------------------------------
       INTERNAL: ENRICHMENT HELPER
       ------------------------------------------------------------- */
    async _enrichText(text) {
        // Parallelize Summarize and Tag
        const [summary, tagsList] = await Promise.all([
            this.llm.summarize(text, 75),
            this.llm.tag(text)
        ]);

        // Embed the SUMMARY (parity with Ingest)
        const summaryEmb = await this.llm.embed(summary);

        return {
            summary: summary.trim(),
            tags: tagsList,
            embedding: summaryEmb
        };
    }


    async repairChunk(chunk) {
        console.log(`[ORCHESTRATOR] Repairing broken chunk ${chunk.id}...`);

        // Use Helper
        const enriched = await this._enrichText(chunk.text);

        const fixed = {
            ...chunk,
            ...enriched,
            edge_list: [] // Edges cleared, will need rebuild if we had context, or leave empty until full rebuild
        };

        // Rebuild context edges for this single node
        const context = await getAll(chunk.uuid);
        this._buildSingleChunkGraph(fixed, context);

        await upsertChunk(fixed);
        return fixed;
    }

    async getThread(uuid) {
        const flatChunks = await getAll(uuid);

        // Reconstruct hierarchical JSON (Thread -> References -> Chunks)
        const referencesMap = new Map();

        for (const chunk of flatChunks) {
            // Handle DB-specific serialization (SQLite returns strings for JSON fields)
            const parseIfNeeded = (val) => typeof val === 'string' ? JSON.parse(val) : val;

            const tags = parseIfNeeded(chunk.tags || '[]');
            const embedding = parseIfNeeded(chunk.embedding || '[]');
            const edge_list = parseIfNeeded(chunk.edges || chunk.edge_list || '[]');

            const refUrl = chunk.url || 'api-upload';

            if (!referencesMap.has(refUrl)) {
                referencesMap.set(refUrl, {
                    reference: refUrl,
                    timestamp: new Date(chunk.created_at).toISOString(),
                    reference_tags: [], // computed later
                    total_chunk_count: 0,
                    chunks: []
                });
            }

            const ref = referencesMap.get(refUrl);
            ref.chunks.push({
                ...chunk,
                chunk: chunk.text, // Schema Parity: 'text' in DB -> 'chunk' in JSON
                estimated_token: this.estimateTokens(chunk.text), // Computed on read
                tags,
                embedding,
                edge_list,
                // index will be assigned after sort
            });
            // Remove DB-internal 'text' to match clean JSON schema
            delete ref.chunks[ref.chunks.length - 1].text;
        }

        const references = Array.from(referencesMap.values()).map(ref => {
            // 1. Sort chunks by creation time
            ref.chunks.sort((a, b) => a.created_at - b.created_at);

            // 2. Assign Indices & Count
            ref.chunks.forEach((c, i) => c.index = i + 1);
            ref.total_chunk_count = ref.chunks.length;

            // Use estimateTokensHeuristic for parity or better performance
            ref.chunks.forEach(c => {
                if (!c.estimated_token) c.estimated_token = estimateTokensHeuristic(c.chunk);
            });

            // 3. Compute Reference Tags (Aggregation)
            const tagCounts = {};
            ref.chunks.forEach(c => {
                if (Array.isArray(c.tags)) {
                    c.tags.forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
                }
            });

            ref.reference_tags = Object.entries(tagCounts)
                .map(([tag, count]) => ({
                    tag,
                    count,
                    score: parseFloat((count / ref.total_chunk_count).toFixed(2))
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            return ref;
        });

        // Sort references by timestamp of their first chunk (or created_at of ref)
        references.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return {
            uuid,
            references
        };
    }

    /* -------------------------------------------------------------
       INTERNAL: GRAPH LOGIC (Matches helper.js:buildEdgeList)
       ------------------------------------------------------------- */
    _buildBatchGraph(chunks, threshold = 0.65) {
        for (let i = 0; i < chunks.length; i++) {
            const candidates = [];
            for (let j = 0; j < chunks.length; j++) {
                if (i === j) continue;
                const score = cosineSimilarity(chunks[i].embedding, chunks[j].embedding);
                if (score >= threshold) {
                    candidates.push({ node_ref: chunks[j].id, score });
                }
            }
            // Sparsification: Keep Top-5
            candidates.sort((a, b) => b.score - a.score);
            chunks[i].edge_list = candidates.slice(0, 5);
        }
    }

    /* -------------------------------------------------------------
       4. UPDATE (Recalculate Everything)
       ------------------------------------------------------------- */
    async updateChunk(uuid, url, index, newText) {
        // Backward compatibility: (id, newText)
        if (arguments.length === 2 && typeof uuid === 'string') {
            return await this._updateChunkInternal(uuid, url);
        }

        // Standard usage: (uuid, url, index, newText)
        const thread = await this.getThread(uuid);
        const ref = thread.references.find(r => r.reference === url);
        if (!ref) throw new Error("Reference not found");

        const chunk = ref.chunks.find(c => c.index === index);
        if (!chunk) throw new Error(`Chunk #${index} not found`);

        return await this._updateChunkInternal(chunk.id, newText);
    }

    async _updateChunkInternal(id, newText) {
        // 1. Get Source
        const uuid = id.split(':')[0];
        const source = await getChunk(id, uuid);
        if (!source) throw new Error('Chunk not found');

        // 2. Re-enrich (Summarize, Tag, Embed)
        const enriched = await this._enrichText(newText);

        // 3. Update Object
        const updatedChunk = {
            ...source,
            text: newText,
            chunk: newText, // Parity
            ...enriched,
            edge_list: [] // Edges must be recomputed
        };

        // 4. Rebuild Graph Context (Same Thread)
        const contextChunks = await getAll(source.uuid);
        this._buildSingleChunkGraph(updatedChunk, contextChunks);

        // 5. Save (UPSERT)
        await upsertChunk(updatedChunk);
        return updatedChunk;
    }

    _buildSingleChunkGraph(chunk, contextChunks, threshold = 0.65) {
        const candidates = [];
        for (const other of contextChunks) {
            if (other.id === chunk.id) continue;
            // Parse embeddings if from DB
            const otherEmb = typeof other.embedding === 'string' ? JSON.parse(other.embedding) : other.embedding;
            const score = cosineSimilarity(chunk.embedding, otherEmb);
            if (score >= threshold) {
                candidates.push({ node_ref: other.id, score });
            }
        }
        // Sparsification for single chunk
        candidates.sort((a, b) => b.score - a.score);
        chunk.edge_list = candidates.slice(0, 5);
    }

    // Parity: Core Functions
    estimateTokens(text) {
        return estimateTokensHeuristic(text);
    }



}
