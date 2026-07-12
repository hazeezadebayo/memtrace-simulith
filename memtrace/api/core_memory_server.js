import express from 'express';
import { authenticate } from './auth_server.js';
import { upsertChunk, getChunk, deleteChunk, search } from '../extension/core/memory.js';

const router = express.Router();

let orchestrator = null;
let LLM = null;
export function injectCoreDependencies(orch, llmInstance) {
    orchestrator = orch;
    LLM = llmInstance;
}

router.post('/v1/ingest', authenticate, async (req, res) => {
    try {
        const { text, url } = req.body;
        const uuid = req.user.uuid; // Securely extract from token
        if (!text || !uuid) return res.status(400).json({ error: 'text and uuid required' });

        const result = await orchestrator.ingest(text, url, uuid);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Thread Retrieval
router.get('/v1/thread', authenticate, async (req, res) => {
    try {
        const uuid = req.user.uuid;
        const data = await orchestrator.getThread(uuid);
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Raw Chunk Operations (RemoteAdapter Support)
router.post('/v1/chunk', authenticate, async (req, res) => {
    try {
        const chunk = req.body;
        if (!chunk.id) return res.status(400).json({ error: 'Chunk ID required' });
        // SECURITY ENFORCEMENT: Never trust the client's UUID payload.
        chunk.uuid = req.user.uuid; 
        await upsertChunk(chunk);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/v1/chunk/batch', authenticate, async (req, res) => {
    try {
        const { chunks } = req.body;
        if (!Array.isArray(chunks)) return res.status(400).json({ error: 'chunks array required' });
        // SECURITY ENFORCEMENT: Forcefully apply the authenticated user's UUID
        for (const c of chunks) {
            c.uuid = req.user.uuid;
            await upsertChunk(c);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/v1/chunk/:id', authenticate, async (req, res) => {
    try {
        const uuid = req.user.uuid; // Explicit UUID check
        // getChunk requires (id, uuid) now
        const chunk = await getChunk(req.params.id, uuid);
        res.json(chunk);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/v1/chunk/:id/copy', authenticate, async (req, res) => {
    try {
        const { targetUuid, targetUrl } = req.body;
        if (!targetUuid || !targetUrl) return res.status(400).json({ error: 'targetUuid and targetUrl required' });
        // SECURITY ENFORCEMENT: Ensure the user is only copying into their own UUID space
        if (targetUuid !== req.user.uuid) return res.status(403).json({ error: 'Forbidden: Cannot copy to another user\'s workspace' });
        const result = await orchestrator.copyChunk(req.params.id, req.user.uuid, targetUrl);
        res.json({ success: true, chunk: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/v1/chunk/:id', authenticate, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'text required' });
        // SECURITY ENFORCEMENT: Ensure the chunk being modified belongs to the authenticated user
        const existingChunk = await getChunk(req.params.id, req.user.uuid);
        if (!existingChunk) return res.status(404).json({ error: 'Chunk not found or access denied' });
        
        const result = await orchestrator.updateChunk(req.user.uuid, existingChunk.url, existingChunk.index, text);
        res.json({ success: true, chunk: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/v1/chunk/:id', authenticate, async (req, res) => {
    try {
        const uuid = req.user.uuid; // Get UUID from secure token
        // Orchestrator delete call logic logic:
        // orchestrator.deleteChunk handles "uuid" as first arg in legacy check but typically calls deleteChunk(id).
        // BUT orchestrator is high level. RemoteAdapter calls RAW delete usually?
        // RemoteAdapter calls `DELETE /v1/chunk/:id`.
        // If we map this to MEMORY directly:
        await deleteChunk(req.params.id, uuid);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/v1/thread/ref', authenticate, async (req, res) => {
    try {
        const { url } = req.query;
        const uuid = req.user.uuid;
        if (!url) return res.status(400).json({ error: 'url query param required' });
        await orchestrator.deleteRef(uuid, url);
        res.json({ success: true });
    } catch (e) { 
        console.error("🚨 DELETE_REF ERROR:", e);
        res.status(500).json({ error: e.message }); 
    }
});

router.post('/v1/chat', authenticate, async (req, res) => {
    const controller = new AbortController();
    const onClose = () => {
        controller.abort();
    };
    req.on('close', onClose);

    try {
        const { prompt, max_tokens } = req.body;
        if (!prompt) return res.status(400).json({ error: 'prompt required' });

        const store = { uuid: req.user.uuid, signal: controller.signal };
        const text = await global.memtraceLlmContext.run(store, async () => {
            return await LLM.call(prompt, max_tokens || 200);
        });
        res.json({ text });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        req.off('close', onClose);
    }
});

router.post('/v1/search', authenticate, async (req, res) => {
    try {
        const { query } = req.body;
        const uuid = req.user.uuid;
        if (!query || !uuid) return res.status(400).json({ error: 'query and uuid required' });

        // Use Orchestrator's full pipeline (Embed -> Search -> Expand)
        const results = await orchestrator.search(uuid, query);
        res.json(results);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/v1/search/vector', authenticate, async (req, res) => {
    try {
        const { vector, tags, limit, query } = req.body;
        const uuid = req.user.uuid;
        // Map to Memory Search directly (RemoteAdapter expectation)
        // Note: Memory.search(vec, tags, limit, query, uuid)

        if (!uuid) return res.status(400).json({ error: 'uuid required for search' });

        const hits = await search(vector, tags, limit, query, uuid);
        res.json(hits);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
