/* ==================================================================
   db/abstraction.js
   Base MemoryStore Interface & Factory
   Simple, Extensible, Testable.
   ================================================================== */

export class MemoryStore {
    async init() { throw new Error('Not implemented'); }
    async add(chunk) { throw new Error('Not implemented'); } // Upsert
    async addBatch(chunks) { throw new Error('Not implemented'); } // Transaction
    async get(id, uuid) { throw new Error('Not implemented'); }
    async getAll(uuid) { throw new Error('Not implemented'); } // Get full thread
    async getTags(uuid) { throw new Error('Not implemented'); } // Tag Aggregation
    async getEdges(id, uuid) { throw new Error('Not implemented'); } // Graph Neighbors
    async delete(id, uuid) { throw new Error('Not implemented'); }
    async deleteRef(uuid, url) { throw new Error('Not implemented'); }
    async search(vector, tags, limit, query, uuid) { throw new Error('Not implemented'); }
    async graphSearch(startId, uuid, depth) { throw new Error('Not implemented'); } // BFS replacement
}

export async function createMemoryStore(type, config) {
    if (type === 'sqlite') {
        const { SQLiteAdapter } = await import('./sqlite-adapter.js');
        const db = new SQLiteAdapter(config);
        await db.init();
        return db;
    } else if (type === 'postgres') {
        const { PostgresAdapter } = await import('./postgres-adapter.js');
        const db = new PostgresAdapter(config);
        await db.init();
        return db;
    }
    throw new Error(`Unknown DB type: ${type}`);
}

// === SELF-TEST ===
if (typeof process !== 'undefined' && process.argv[1] === import.meta.url) {
    console.log("Test: Factory exists");
}
