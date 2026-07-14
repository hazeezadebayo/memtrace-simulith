/* ==================================================================
   memory.js
   Unified Memory Store Interface
   Switches between SQLite (WASM) and Postgres (Remote) via MemoryFactory.
   Zero JSON-file logic. 100% SQL-interface driven.
   ================================================================== */

import { MemoryFactory, StorageMode } from '../db/memory-factory.js';

/* -----------------------------------------------------------------
   0. CONFIG & FACTORY
   ----------------------------------------------------------------- */
// Default to OFFLINE (Local SQLite WASM)
let CURRENT_MODE = StorageMode.OFFLINE;
let DB = null;
let deviceUUID = null;

export async function initializeStorage(uuid, mode = StorageMode.OFFLINE, config = {}) {
  deviceUUID = uuid;
  CURRENT_MODE = mode;
  DB = await MemoryFactory.init(mode, config);
  console.log(`[Memory] Storage initialized: ${mode}`);
}

/* -----------------------------------------------------------------
   1. CORE CRUD - PROXIED TO DB ADAPTER
   ----------------------------------------------------------------- */
export async function getAll(uuid) {
  if (!DB) throw new Error('Storage not initialized');
  return await DB.getAll(uuid || deviceUUID);
}

export async function clearAllData(targetUuid = null) {
  if (!DB) throw new Error('Storage not initialized');
  if (DB.isLibSQL) {
    if (targetUuid) {
      await DB.db.execute({ sql: 'DELETE FROM chunks WHERE uuid = ?', args: [targetUuid] });
    } else {
      await DB.db.execute('DELETE FROM chunks');
    }
  } else if (DB.db && typeof DB.db.exec === 'function') {
    if (targetUuid) {
      await DB.db.exec('DELETE FROM chunks WHERE uuid = ?', [targetUuid]);
    } else {
      await DB.db.exec('DELETE FROM chunks');
    }
  } else {
    throw new Error('Unsupported DB driver for clearAllData');
  }
}

export async function loadThread(uuid) {
  if (!DB) throw new Error('Storage not initialized');
  // API returns formatted thread, Adapter handles flattening if needed
  // But here we might want the HIERARCHICAL view for the UI.
  // RemoteAdapter.getAll flattens it?
  // Our UI (popup.js) expects { uuid, references: [...] }.
  // If DB.getAll returns flat chunks, we must dehydrate.
  const flatChunks = await DB.getAll(uuid);
  const references = dehydrateChunks(flatChunks);
  return { uuid, references };
}

export async function saveThread(thread) {
  // Persistence is now granular via .add() or .addBatch().
  // "saveThread" in old logic overwrote the JSON file.
  // Here, we should optimally only save changes.
  // But to keep parity with old call signature:
  // We can upsert all chunks.
  const chunks = thread.references.flatMap(ref => ref.chunks.map(c => ({
    ...c,
    uuid: thread.uuid,
    url: ref.reference
  })));

  if (!DB) throw new Error('Storage not initialized');
  await DB.addBatch(chunks);
  return thread;
}

export async function getNextIndex(uuid, url) {
  if (!DB) throw new Error('Storage not initialized');
  // We need to fetch the existing thread/ref to find the max index.
  // We can use loadThread or lighter DB query if avail.
  // For now, loadThread is safe parity.
  const thread = await loadThread(uuid);
  const ref = thread.references.find(r => r.reference === url);
  if (!ref || !ref.chunks.length) return 1; // 1-based index start

  const maxIdx = Math.max(...ref.chunks.map(c => c.index || 0));
  return maxIdx + 1;
}

/* -----------------------------------------------------------------
   2. GRANULAR OPERATIONS
   ----------------------------------------------------------------- */
export async function deleteReference(uuid, reference) {
  if (!DB) throw new Error('Storage not initialized');
  await DB.deleteRef(uuid, reference);
  return true; // DB throws if error
}

export async function getChunk(id, uuid) {
  if (!DB) throw new Error('Storage not initialized');
  return await DB.get(id, uuid);
}

export async function upsertChunk(chunk) {
  if (!DB) throw new Error('Storage not initialized');
  await DB.add(chunk);
  return chunk;
}

export async function search(vector, tags, limit, query, uuid) {
  if (!DB) throw new Error('Storage not initialized');
  return await DB.search(vector, tags, limit, query, uuid);
}

export async function deleteChunk(id, uuid) {
  // node_ref is now passed directly as the ID (e.g. uuid:ts:index)
  // We don't reconstruct it here anymore because we can't guess the timestamp easily.
  if (!DB) throw new Error('Storage not initialized');
  await DB.delete(id, uuid);
  return true;
}

export async function updateThreadIncremental(uuid, url, newChunks, cfg) {
  if (!DB) throw new Error('Storage not initialized');

  let timestamp = Date.now();
  let nextIndex = 0;
  let chunksToAdd = newChunks;

  // AUTO-INCREMENT LOGIC (Fallback)
  // Only triggered if chunks don't have pre-assigned indices (e.g. from raw text)
  // If chunks come from Orchestrator.ingest, they SHOULD have indices.
  const needsIndexing = newChunks.some(c => !c.index || !c.id);

  if (needsIndexing) {
    try {
      const existing = await loadThread(uuid);
      const ref = existing.references.find(r => r.reference === url);

      if (ref && ref.chunks.length > 0) {
        timestamp = ref.timestamp || Date.now();
        const sortedExisting = ref.chunks.sort((a, b) => a.index - b.index);
        const lastOld = sortedExisting[sortedExisting.length - 1];

        // Strategy: Find overlap or append
        const matchIndex = newChunks.findIndex(c => c.chunk === lastOld.chunk);

        if (matchIndex !== -1) {
          chunksToAdd = newChunks.slice(matchIndex + 1);
          nextIndex = lastOld.index + 1;
          console.log(`[Incremental] Overlap found. Appending starting at ${nextIndex}.`);
        } else {
          nextIndex = lastOld.index + 1;
          console.log('[Incremental] No overlap found. Appending all.');
        }
      }
    } catch (e) {
      console.log('[Incremental] Error detecting state:', e);
    }

    if (chunksToAdd.length === 0) {
      console.log('[Incremental] No new chunks to add.');
      return await loadThread(uuid);
    }
  }

  // Final mapping: Respect existing ID/Index if present
  const dbChunks = chunksToAdd.map((c, i) => {
    // If we have a pre-assigned index/id (from getNextIndex in Orchestrator), use it.
    // Otherwise use locally calculated nextIndex + i.
    const finalIndex = c.index || (nextIndex + i);
    const finalId = c.id || `${uuid}:${timestamp}:${finalIndex}`;

    return {
      ...c,
      index: finalIndex,
      id: finalId,
      uuid,
      url,
      text: c.text || c.chunk,
      created_at: c.created_at || timestamp
    };
  });

  await DB.addBatch(dbChunks);

  // Return full thread to update UI
  return await loadThread(uuid);
}


/* -----------------------------------------------------------------
   3. UTILITIES
   ----------------------------------------------------------------- */

// Helper to convert flat chunks back to hierarchical UI format
function dehydrateChunks(flatChunks) {
  const references = {};
  flatChunks.forEach(c => {
    if (!references[c.url]) {
      references[c.url] = {
        reference: c.url,
        chunks: [],
        reference_tags: [], // Aggregated later if needed or DB provides it
        total_chunk_count: 0
      };
    }
    references[c.url].chunks.push(c);
  });

  // Sort and finalize
  return Object.values(references).map(ref => {
    ref.chunks.sort((a, b) => a.index - b.index);
    ref.total_chunk_count = ref.chunks.length;
    // Re-calculate tags provided by DB or helper?
    // DB.getAll doesn't return aggregated tags usually.
    // We can re-run local aggregation helper
    const tagMap = new Map();
    ref.chunks.forEach(ch => {
      let tags = typeof ch.tags === 'string' ? JSON.parse(ch.tags) : ch.tags || [];
      if (ch.chunk_tags) tags = ch.chunk_tags;

      // Ensure chunk_tags is set on the object for valid downstream usage
      ch.chunk_tags = tags;

      tags.forEach(t => {
        const k = t.toLowerCase();
        const e = tagMap.get(k) || { tag: t, count: 0 };
        e.count++;
        tagMap.set(k, e);
      });
    });
    ref.reference_tags = Array.from(tagMap.values()).sort((a, b) => b.count - a.count);

    // Fix: Populate timestamp from max chunk created_at, default to Date.now() if missing
    ref.timestamp = Math.max(...ref.chunks.map(c => c.created_at || 0)) || Date.now();

    return ref;
  }).sort((a, b) => b.timestamp - a.timestamp); // Sort NEWEST first
}

// Copy/Paste logic remains local or needs DB support?
// Copy puts in clipboard. Paste inserts into DB.
let clipboard = null;
export function copyChunk(uuid, reference, index) {
  return async () => {
    const thread = await loadThread(uuid);
    const ref = thread?.references.find(r => r.reference === reference);
    const chunk = ref?.chunks.find(c => c.index === index);
    if (!chunk) return false;
    clipboard = { uuid, reference, index, data: { ...chunk } };
    return true;
  };
}

export async function pasteChunk(targetUuid, targetRef) {
  if (!clipboard) throw new Error('Nothing copied');
  if (clipboard.reference === targetRef) throw new Error('Cannot paste into same reference');

  // Logic: Insert new chunk into target ref.
  const thread = await loadThread(targetUuid);
  const ref = thread.references.find(r => r.reference === targetRef);

  // Reuse reference timestamp if possible to start consistent
  const timestamp = ref ? (ref.timestamp || Date.now()) : Date.now();
  // Calculate max index
  const chunks = ref ? ref.chunks : [];
  const maxIdx = chunks.length ? Math.max(...chunks.map(c => c.index)) : 0;

  const clone = {
    ...clipboard.data,
    index: maxIdx + 1,
    id: `${targetUuid}:${timestamp}:${maxIdx + 1}`,
    uuid: targetUuid,
    url: targetRef,
    created_at: timestamp
  };

  if (!DB) throw new Error('Storage not initialized');
  await DB.add(clone);
  return clone;
}
