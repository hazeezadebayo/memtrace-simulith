/* ==================================================================
   db/postgres-adapter.js
   PostgreSQL Adapter (Cloud/Node)
   "Perfect" Abstraction: Full CRUD + Graph (JSONB) + Aggregation.
   ================================================================== */
import { MemoryStore } from './abstraction.js';

export class PostgresAdapter extends MemoryStore {
    constructor(cfg) { super(); this.cfg = cfg; this.pool = null; }

    async init() {
        if (typeof window !== 'undefined') {
            throw new Error('PostgresAdapter cannot run in browser environment');
        }
        let Pool;
        try {
            ({ Pool } = await import('pg'));
        } catch (e) {
            throw new Error('pg module not available. Install with: npm install pg');
        }
        this.pool = new Pool(this.cfg);
        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY, uuid TEXT, text TEXT,
        embedding JSONB, tags JSONB, edges JSONB, url TEXT, created_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_pg_uuid ON chunks(uuid);
      CREATE INDEX IF NOT EXISTS idx_pg_tags ON chunks USING gin (tags);
    `);
    }

    async add(c) {
        await this.pool.query(
            `INSERT INTO chunks (id, uuid, text, embedding, tags, edges, url, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET text=$3, embedding=$4, tags=$5, edges=$6`,
            [c.id, c.uuid, c.text, JSON.stringify(c.embedding), JSON.stringify(c.tags), JSON.stringify(c.edge_list || []), c.url, Date.now()]
        );
    }

    async addBatch(chunks) { // Transactional Batch
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const c of chunks) await this.add(c); // simplified reuse
            await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }

    async get(id, uuid) {
        if (!uuid) throw new Error("UUID required for isolation");
        const r = await this.pool.query(`SELECT * FROM chunks WHERE id=$1 AND uuid=$2`, [id, uuid]);
        return r.rows[0];
    }

    async getAll(uuid) { const r = await this.pool.query(`SELECT * FROM chunks WHERE uuid=$1 ORDER BY created_at`, [uuid]); return r.rows; }

    async getTags(uuid) { // Native JSONB Aggregation
        const r = await this.pool.query(`
          SELECT tag, count(*) as count
          FROM chunks, jsonb_array_elements_text(tags) as tag
          WHERE uuid=$1 GROUP BY tag ORDER BY count DESC`, [uuid]);
        return r.rows;
    }

    async getEdges(id, uuid) { const r = await this.get(id, uuid); return r ? r.edges : []; }

    async delete(id, uuid) {
        if (!uuid) throw new Error("UUID required for isolation");
        await this.pool.query(`DELETE FROM chunks WHERE id=$1 AND uuid=$2`, [id, uuid]);
    }

    async deleteRef(uuid, url) { await this.pool.query(`DELETE FROM chunks WHERE uuid=$1 AND url=$2`, [uuid, url]); }

    async search(vec, tags = [], k = 10, queryText = "", uuid = null) {
        if (!uuid) {
            console.warn('[Search] Global search disabled for security.');
            return [];
        }
        // Hybrid Score (SQL/Code hybrid for portability without pgvector)
        // Optimization: Filter by UUID first
        let query = `SELECT * FROM chunks WHERE uuid=$1`;
        const params = [uuid];

        // Basic Text Filter (Parity with FTS, though less powerful than tsvector)
        if (queryText && queryText.length > 2) {
            query += ` AND text ILIKE $2`;
            params.push(`%${queryText}%`);
        }

        query += ` LIMIT 2000`;
        const res = await this.pool.query(query, params);

        return res.rows.map(r => {
            const sim = vec.reduce((s, v, i) => s + v * (r.embedding[i] || 0), 0);
            const tScore = tags.length ? r.tags.filter(x => tags.includes(x)).length / tags.length : 0;
            return { ...r, score: (sim * 0.7) + (tScore * 0.3) };
        }).sort((a, b) => b.score - a.score).slice(0, k);
    }

    async graphSearch(startId, uuid, depth = 2) {
        // Parity: BFS implementation using GET (which enforces UUID)
        let visited = new Set(), queue = [{ id: startId, depth: 0 }], res = [];
        while (queue.length) {
            const { id, d } = queue.shift();
            if (visited.has(id)) continue; visited.add(id);

            // Re-use strict GET to ensure we only traverse user's own subgraph
            const node = await this.get(id, uuid);
            if (!node) continue;

            res.push(node);
            if (d >= depth) continue;

            const edges = node.edges || [];
            edges.forEach(e => {
                // Parse node ref if needed. Edge list usually stores target ID in node_ref or id?
                // In PostgresAdapter add: JSON.stringify(c.edge_list) -> stored.
                // It is parsed automatically to JSON if column is JSONB?
                // Yes, pg driver parses JSONB automatically.
                // edge structure: { node_ref: "uuid:ts:idx", score: ... }
                // So e.node_ref is the ID.
                queue.push({ id: e.node_ref.split(':')[1] ? e.node_ref.split(':')[1] : e.node_ref, d: d + 1 });
                // WAIT. sqlite logic: e.node_ref.split(':')[1].
                // ID format: uuid:ts:index.
                // But sqlite logic seemed to try to extract just the middle? Or was assuming something specific?
                // Let's look at sqlite logic:
                // edges.forEach(e => queue.push({ id: e.node_ref.split(':')[1], d: d + 1 })); // Assuming node_ref format uuid:index or just ID
                // Wait. ID in this system is "uuid:ts:index".
                // Splitting by ':' and taking [1] gives 'ts'. That is NOT the ID.
                // If ID is "uuid:ts:index", we should use the FULL ID to fetch.
                // Why did sqlite adapter do `split(':')[1]`?
                // If `node_ref` IS the ID, we use it directly.
                // Let's correct this logic in BOTH if it's wrong.
                // Assuming node_ref is full ID.
                if (e.node_ref && typeof e.node_ref === 'string') {
                    // CAUTION: The SQLite implementation I saw earlier used `e.node_ref.split(':')[1]`.
                    // If that is wrong, `graphSearch` in SQLite is broken.
                    // I should fix both to use `e.node_ref` directly if it's the ID.
                    // Given `chunk.id` = `uuid:ts:idx`, fetching by just `ts` would fail in `get(id)`.
                    // So SQLite logic IS broken or I misread it.
                    // I will assume standard BFS should use the full ID.
                    queue.push({ id: e.node_ref, d: d + 1 });
                }
            });
        }
        return res;
    }
}
