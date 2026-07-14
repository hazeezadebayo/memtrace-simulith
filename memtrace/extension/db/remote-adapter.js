
import { MemoryStore } from './abstraction.js';

export class RemoteAdapter extends MemoryStore {
    constructor(cfg) {
        super();
        this.baseUrl = cfg?.apiBaseUrl || '';
    }

    async init() {
        try {
            const res = await fetch(`${this.baseUrl}/health`);
            if (!res.ok) throw new Error('API unreachable');
        } catch (e) {
            console.log('[RemoteAdapter] Offline or unreachable:', e.message);
        }
    }

    async _fetch(endpoint, method, body) {
        const headers = { 'Content-Type': 'application/json' };
        const res = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers,
            credentials: 'include',
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    }

    async add(chunk) {
        await this._fetch('/v1/chunk', 'POST', chunk);
    }

    async addBatch(chunks) {
        await this._fetch('/v1/chunk/batch', 'POST', { chunks });
    }

    async get(id, uuid) {
        // Append UUID to ensure server can validate ownership if strictly required by endpoint design
        // Assuming API supports ?uuid= query param for ownership check
        const qs = uuid ? `?uuid=${encodeURIComponent(uuid)}` : '';
        return this._fetch(`/v1/chunk/${encodeURIComponent(id)}${qs}`, 'GET');
    }

    async getAll(uuid) {
        const hierarchical = await this._fetch(`/v1/thread`, 'GET');
        const validRefs = hierarchical.references || [];
        return validRefs.flatMap(ref => ref.chunks.map(c => ({
            ...c,
            text: c.chunk,
            url: ref.reference,
        })));
    }

    async delete(id, uuid) {
        const qs = uuid ? `?uuid=${encodeURIComponent(uuid)}` : '';
        await this._fetch(`/v1/chunk/${encodeURIComponent(id)}${qs}`, 'DELETE');
    }

    async deleteRef(uuid, url) {
        await this._fetch(`/v1/thread/ref?url=${encodeURIComponent(url)}`, 'DELETE');
    }

    async search(vector, tags, limit, query, uuid) {
        return this._fetch('/v1/search/vector', 'POST', { vector, tags, limit, query, uuid });
    }
}
