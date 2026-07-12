
import { jest } from '@jest/globals';

// 1. Mock Dependencies BEFORE imports
const mockMemory = {
    loadThread: jest.fn(),
    search: jest.fn().mockResolvedValue([{
        score: 0.9,
        chunk: { id: 'c1:0', text: 'c1', edge_list: JSON.stringify([]) }
    }]), // Default search result if needed, though Orchestrator uses it for fallback
    getAll: jest.fn(),
    initializeStorage: jest.fn(),
    deleteReference: jest.fn(),
    deleteChunk: jest.fn(),
    getChunk: jest.fn(),
    upsertChunk: jest.fn()
};

jest.unstable_mockModule('../extension/core/memory.js', () => mockMemory);

// Mock Helper (common dependency)
jest.unstable_mockModule('../extension/core/helper.js', () => ({
    setupXenovaEnv: jest.fn(),
    estimateTokens: jest.fn().mockReturnValue(10) // Mock implementation
}));

// 2. Dynamic Import
const { ThreadletOrchestrator } = await import('../extension/core/orchestrator.js');

describe('Graph Traversal Depth', () => {
    let orchestrator;

    beforeEach(() => {
        jest.clearAllMocks();

        const mockLLM = {
            embed: jest.fn().mockResolvedValue(Array(384).fill(0.1)),
            call: jest.fn().mockResolvedValue("tag1, tag2"),
            tag: jest.fn().mockResolvedValue(["tag1"]),
            getConfig: jest.fn().mockResolvedValue({})
        };

        orchestrator = new ThreadletOrchestrator(mockLLM);
    });

    test('should limit edge expansion to MAX_EDGE_TRAVERSAL_DEPTH (3)', async () => {
        // Mock Data
        // C1 has 5 edges. Config limit is 3.
        const c1Edges = [
            { node_ref: "id2", score: 0.9 },
            { node_ref: "id3", score: 0.8 },
            { node_ref: "id4", score: 0.7 },
            { node_ref: "id5", score: 0.6 },
            { node_ref: "id6", score: 0.5 }
        ];

        const mockThread = {
            references: [{
                reference: "ref1",
                chunks: [
                    {
                        id: "c1:0",
                        index: 1,
                        embedding: Array(384).fill(0.1),
                        text: "c1",
                        tags: ["tag1"],
                        edge_list: JSON.stringify(c1Edges)
                    },
                    // Neighbors
                    { id: "id2", index: 2, embedding: Array(384).fill(0.1), text: "c2", tags: [], edge_list: [] },
                    { id: "id3", index: 3, embedding: Array(384).fill(0.1), text: "c3", tags: [], edge_list: [] },
                    { id: "id4", index: 4, embedding: Array(384).fill(0.1), text: "c4", tags: [], edge_list: [] },
                    { id: "id5", index: 5, embedding: Array(384).fill(0.1), text: "c5", tags: [], edge_list: [] },
                    { id: "id6", index: 6, embedding: Array(384).fill(0.1), text: "c6", tags: [], edge_list: [] }
                ]
            }]
        };

        // Setup Mock Return
        mockMemory.loadThread.mockResolvedValue(mockThread);

        // We also need to mock `search` (Shim) because Orchestrator calls it first to get candidates.
        // We simulate that the DB search returned C1.
        mockMemory.search.mockResolvedValue([
            {
                score: 0.9,
                id: "c1:0",
                text: "c1",
                edge_list: JSON.stringify(c1Edges),
                url: "ref1",
                index: 1 // Add index for logging
            }
        ]);

        // Run
        const results = await orchestrator.search("uuid", "query");

        // Verification
        // Expect: C1 (Match) + 3 Neighbors (Expanded) = 4 Total
        console.log(`Results count: ${results.length}`);

        // The Orchestrator applies:
        // 1. Initial candidates (C1)
        // 2. Expand C1 -> Top 3 edges (id2, id3, id4)
        // 3. Total = 4

        expect(results.length).toBe(4);

        // Verify specifically that id5 and id6 (scores 0.6 and 0.5) are NOT present
        // (Assuming 0.6 is > threshold 0.4, so they WOULD be included if not for Depth limit)
        const ids = results.map(r => r.chunk.id);
        expect(ids).toContain('c1:0');
        expect(ids).toContain('id2');
        expect(ids).toContain('id3');
        expect(ids).toContain('id4');
        expect(ids).not.toContain('id5');
        expect(ids).not.toContain('id6');
    });
});
