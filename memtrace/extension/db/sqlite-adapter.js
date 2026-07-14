/* ==================================================================
   db/sqlite-adapter.js
   SQLite WASM Adapter (Browser/Local)
   "Perfect" Abstraction: Full CRUD + Graph + Tag Aggregation.
   ================================================================== */
import { MemoryStore } from './abstraction.js';

export class SQLiteAdapter extends MemoryStore {
    constructor(cfg) { super(); this.cfg = cfg; this.path = cfg?.path || 'memtrace.sqlite'; this.db = null; }

    async init() {
        let SQL;
        if (typeof window !== 'undefined') {
            const initSqlJs = (await import('./sql/sql-wasm.js')).default;
            SQL = await initSqlJs({ locateFile: () => '/extension/db/sql/sql-wasm.wasm' });
        } else {
            const { createClient } = await import('@libsql/client');
            const dbUrl = this.cfg?.connectionString || process.env.TURSO_DATABASE_URL || `file:${this.path}`;
            const authToken = this.cfg?.auth_token || process.env.TURSO_AUTH_TOKEN;
            this.db = createClient({
                url: dbUrl,
                authToken: authToken
            });
            this.isLibSQL = true;
            await this._schema(); return;
        }
        try {
            const root = await navigator.storage.getDirectory();
            const h = await root.getFileHandle(this.path, { create: true });
            this.db = new SQL.Database(new Uint8Array(await (await h.getFile()).arrayBuffer()));
            this.db.handle = h;
        } catch (e) { this.db = new SQL.Database(); }
        await this._schema();
    }

    async _schema() {
        await this.exec(`CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, uuid TEXT, text TEXT, embedding JSON, tags JSON, edges JSON, url TEXT, created_at INTEGER, summary TEXT, meta JSON)`);
        await this.exec(`CREATE INDEX IF NOT EXISTS idx_uuid ON chunks(uuid)`);
        await this.exec(`CREATE INDEX IF NOT EXISTS idx_url ON chunks(url)`);

        // Migration: Add columns if they are missing (simple check)
        const cols = (await this.query("PRAGMA table_info(chunks)")).map(c => c.name);
        if (!cols.includes('summary')) try { await this.exec("ALTER TABLE chunks ADD COLUMN summary TEXT"); } catch (e) { }
        if (!cols.includes('meta')) try { await this.exec("ALTER TABLE chunks ADD COLUMN meta JSON"); } catch (e) { }

        // FTS5 Virtual Table for Hybrid Search
        // Note: We duplicate data (text, tags, uuid) to avoid complexity with rowid mapping in WASM.
        try {
            await this.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, tags, uuid)`);

            // Drop old triggers to ensure they are recreated with correct logic
            await this.exec(`DROP TRIGGER IF EXISTS chunks_ai`);
            await this.exec(`DROP TRIGGER IF EXISTS chunks_ad`);
            await this.exec(`DROP TRIGGER IF EXISTS chunks_au`);

            // Triggers for Synchronization
            // 1. INSERT
            await this.exec(`CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
              INSERT INTO chunks_fts(rowid, text, tags, uuid) VALUES (new.rowid, new.text, new.tags, new.uuid);
            END;`);

            // 2. DELETE
            await this.exec(`CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
              DELETE FROM chunks_fts WHERE rowid = old.rowid;
            END;`);

            // 3. UPDATE
            await this.exec(`CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
              DELETE FROM chunks_fts WHERE rowid = old.rowid;
              INSERT INTO chunks_fts(rowid, text, tags, uuid) VALUES (new.rowid, new.text, new.tags, new.uuid);
            END;`);
        } catch (e) {
            if (e.message && e.message.includes('no such module: fts5')) {
                console.log('[SQLite] Native FTS5 module missing. Active: JS-FTS Shim (Full Text+Tag Parity).');
            } else {
                console.error('[SQLite] FTS5 initialization failed:', e);
            }
        }
    }

    async _save() {
        if (!this.db.handle) return;
        try {
            const data = this.db.export();
            const writable = await this.db.handle.createWritable();
            await writable.write(data);
            await writable.close();
            console.log('[SQLite] Saved to disk.');
        } catch (e) {
            console.error('[SQLite] Save failed:', e);
        }
    }

    async exec(sql, p = []) {
        if (this.isLibSQL) {
            return await this.db.execute({ sql, args: p });
        }
        if (this.db.prepare) {
            const stmt = this.db.prepare(sql);
            try {
                stmt.bind(p);
                while (stmt.step()) {}
                return true;
            } finally {
                if (stmt.free) stmt.free();
            }
        }
        return this.db.exec(sql, p);
    }

    async query(sql, p = []) {
        if (this.isLibSQL) {
            const res = await this.db.execute({ sql, args: p });
            let rows = res.rows;
            return rows.map(r => {
                const meta = typeof r.meta === 'string' ? JSON.parse(r.meta) : (r.meta || {});
                return {
                    ...r,
                    ...meta,
                    chunk: r.text,
                    embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : (r.embedding || []),
                    tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []),
                    edge_list: typeof r.edges === 'string' ? JSON.parse(r.edges) : (r.edges || [])
                };
            });
        }

        let rows = [];
        if (this.db.prepare) {
            const stmt = this.db.prepare(sql);
            try {
                stmt.bind(p);
                while (stmt.step()) rows.push(stmt.getAsObject());
            } finally {
                if (stmt.free) stmt.free();
            }
        } else {
            // Fallback for older interface or exec-only
            const r = this.db.exec(sql, p);
            rows = r.length ? r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : [];
        }

        // Unpack metadata
        return rows.map(r => {
            const meta = r.meta ? JSON.parse(r.meta) : {};
            return {
                ...r,
                ...meta,
                chunk: r.text,
                embedding: r.embedding ? JSON.parse(r.embedding) : [],
                tags: r.tags ? JSON.parse(r.tags) : [],
                edge_list: r.edges ? JSON.parse(r.edges) : []
            };
        });
    }

    async add(c) {
        const meta = {
            chunk_word_count: c.chunk_word_count,
            estimated_token: c.estimated_token,
            index: c.index
        };
        const text = c.text || c.chunk || ''; // Handle text alias
        const summary = c.summary || '';
        const embedding = c.embedding || [];
        const tags = c.tags || c.chunk_tags || [];

        await this.exec(`INSERT OR REPLACE INTO chunks VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [c.id, c.uuid, text, JSON.stringify(embedding), JSON.stringify(tags), JSON.stringify(c.edge_list || []), c.url, c.created_at || Date.now(), summary, JSON.stringify(meta)]);
        await this._save();
    }

    async addBatch(chunks) {
        if (this.isLibSQL) {
            // libSQL batch processing using promises
            await this.exec('BEGIN TRANSACTION');
            try {
                for (const c of chunks) {
                    const meta = { chunk_word_count: c.chunk_word_count, estimated_token: c.estimated_token, index: c.index };
                    const text = c.text || c.chunk || '';
                    const summary = c.summary || '';
                    const embedding = c.embedding || [];
                    const tags = c.tags || c.chunk_tags || [];
                    await this.exec(`INSERT OR REPLACE INTO chunks VALUES (?,?,?,?,?,?,?,?,?,?)`, 
                        [c.id, c.uuid, text, JSON.stringify(embedding), JSON.stringify(tags), JSON.stringify(c.edge_list || []), c.url, c.created_at || Date.now(), summary, JSON.stringify(meta)]);
                }
            } catch(e) {
                await this.exec('ROLLBACK');
                throw e;
            }
            await this.exec('COMMIT');
            await this._save();
            return;
        }

        this.exec('BEGIN TRANSACTION');
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO chunks VALUES (?,?,?,?,?,?,?,?,?,?)`);
        try {
            chunks.forEach(c => {
                const meta = {
                    chunk_word_count: c.chunk_word_count,
                    estimated_token: c.estimated_token,
                    index: c.index
                };
                const text = c.text || c.chunk || '';
                const summary = c.summary || '';
                const embedding = c.embedding || [];
                const tags = c.tags || c.chunk_tags || [];

                stmt.run([c.id, c.uuid, text, JSON.stringify(embedding), JSON.stringify(tags), JSON.stringify(c.edge_list || []), c.url, c.created_at || Date.now(), summary, JSON.stringify(meta)]);
            });
        } finally {
            if (stmt.free) stmt.free();
        }
        this.exec('COMMIT');
        await this._save();
    }

    async get(id, uuid) {
        if (!uuid) throw new Error("UUID required for isolation");
        const rows = await this.query(`SELECT * FROM chunks WHERE id=? AND uuid=?`, [id, uuid]);
        return rows[0];
    }

    async getAll(uuid) { return await this.query(`SELECT * FROM chunks WHERE uuid=? ORDER BY created_at`, [uuid]); }

    async delete(id, uuid) {
        if (!uuid) throw new Error("UUID required for isolation");
        await this.exec(`DELETE FROM chunks WHERE id=? AND uuid=?`, [id, uuid]);
        await this._save();
    }

    async deleteRef(uuid, url) {
        await this.exec(`DELETE FROM chunks WHERE uuid=? AND url=?`, [uuid, url]);
        await this._save();
    }

    async getTags(uuid) { // Aggregation replacement for helper.js
        const rows = await this.query(`SELECT value as tag, COUNT(*) as count FROM chunks, json_each(tags) WHERE uuid=? GROUP BY tag ORDER BY count DESC`, [uuid]);
        return rows;
    }

    async getEdges(id, uuid) {
        const row = await this.get(id, uuid);
        return row ? JSON.parse(row.edges || '[]') : [];
    }

    async graphSearch(startId, uuid, depth = 2) { // BFS replacement
        // Simple recursive or loop implementation fetching by ID AND UUID
        let visited = new Set(), queue = [{ id: startId, depth: 0 }], res = [];
        while (queue.length) {
            const { id, d } = queue.shift();
            if (visited.has(id)) continue; visited.add(id);
            const node = await this.get(id, uuid); if (!node) continue;
            res.push(node); if (d >= depth) continue;
            const edges = JSON.parse(node.edges || '[]');
            edges.forEach(e => {
                if (e.node_ref) queue.push({ id: e.node_ref, d: d + 1 });
            });
        }
        return res;
    }

    async search(vec, tags = [], k = 10, queryText = "", uuid = null) {
        console.log(`[SEARCH] Starting search. Query="${queryText}", TagCount=${tags.length}, UUID=${uuid}`);
        let candidates = [];

        // 1. Candidate Generation (FTS5) - High Recall, Low Cost
        if (this.ftsEnabled !== false && queryText && queryText.length > 2) {
            try {
                // Sanitize query for FTS5 syntax (prevent syntax errors)
                const cleanQuery = queryText.replace(/"/g, '""');

                // Construct FTS Query: Match text OR tags
                // "apple pie" OR tags: "food"
                let ftsQuery = `"${cleanQuery}" OR tags:"${tags.join('" OR tags:"')}"`;
                if (uuid) ftsQuery = `uuid:"${uuid}" AND (${ftsQuery})`;

                console.log(`[SEARCH] FTS Query: ${ftsQuery}`);
                const ftsRows = await this.query(`SELECT rowid, * FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT 200`, [ftsQuery]);
                console.log(`[SEARCH] FTS Hits: ${ftsRows.length}`);

                if (ftsRows.length > 0) {
                    const rowids = ftsRows.map(r => r.rowid).join(',');
                    candidates = await this.query(`SELECT * FROM chunks WHERE rowid IN (${rowids})`);
                }
            } catch (e) {
                console.warn('[SQLite] FTS Search failed, disabling FTS:', e.message);
                this.ftsEnabled = false; // Disable for future queries
            }
        }

        // 2. Application-Level Fallback/Shim
        if (candidates.length === 0 && uuid) {
            console.log('[SEARCH] FTS returned 0. Entering Fallback Shim.');
            const limit = 5000;
            // Fetch Context (Thread)
            const allRows = await this.query(`SELECT * FROM chunks WHERE uuid=? ORDER BY created_at DESC LIMIT 5000`, [uuid]);
            console.log(`[SEARCH] Fetched ${allRows.length} rows for context scan.`);

            if (queryText && queryText.length > 2) {
                // A. Keyword Search (Token Match) - "Tag Trap" Avoidance Layer 1
                const tokens = queryText.toLowerCase().match(/\w+/g) || [];
                console.log(`[SEARCH] Tokens: ${tokens.join(', ')}`);

                const keywordMatches = allRows.filter((row, i) => {
                    const text = (row.text || '').toLowerCase();
                    let tagsStr = "";
                    try {
                        const t = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
                        if (Array.isArray(t)) tagsStr = t.join(' ').toLowerCase();
                    } catch (e) { }

                    const match = tokens.every(token => {
                        const re = new RegExp(`\\b${token}\\b`, 'i');
                        return re.test(text) || re.test(tagsStr);
                    });

                    // Verbose Sample log (limit output)
                    if (match) console.log(`[SEARCH] Shim Match: Chunk ${row.index}`);
                    return match;
                });

                console.log(`[SEARCH] Keyword Shim Matches: ${keywordMatches.length}`);

                if (keywordMatches.length > 0) {
                    candidates = keywordMatches.slice(0, 500); // Limit subset
                } else if (vec && vec.length > 0) {
                    console.log('[SEARCH] No keyword matches. Fallback to pure vector scan on ALL rows.');
                    candidates = allRows; // We will re-rank ALL of them
                }
            } else {
                // No query text, just return recent chunks (context search?)
                candidates = allRows.slice(0, 500);
            }
        }

        // 3. Re-ranking (Vector Similarity + Tag Scoring)
        // console.log(`[SEARCH] Scoring ${candidates.length} candidates...`);
        const results = candidates.map(r => {
            const emb = Array.isArray(r.embedding) ? r.embedding : JSON.parse(r.embedding || '[]');
            const t = Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags || '[]');

            const sim = (emb.length && vec && vec.length) ? vec.reduce((s, v, i) => s + v * (emb[i] || 0), 0) : 0;

            const tagScore = tags.length ? t.filter(x => tags.includes(x)).length / tags.length : 0;

            const finalScore = (sim * 0.7) + (tagScore * 0.3);

            // Verbose Score Log (Accept logic)
            console.log(`[SEARCH] Candidate ${r.index}: Sim=${sim.toFixed(3)}, TagScore=${tagScore.toFixed(3)}, Final=${finalScore.toFixed(3)}`);

            return { ...r, score: finalScore, _sim: sim, _tag: tagScore }; // Store debug info if needed
        });

        const sorted = results.sort((a, b) => b.score - a.score).slice(0, k);

        // Final Output Log
        console.log('[SEARCH] Final Results:');
        sorted.forEach(r => {
            console.log(`   -> Chunk ${r.index}: Score=${r.score.toFixed(3)}`);
        });

        return sorted;
    }
}
