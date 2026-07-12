import { jest } from '@jest/globals';

// 1. Mock Dependencies BEFORE imports using unstable_mockModule for ESM
const mockMemory = {
    initializeStorage: jest.fn(),
    upsertChunk: jest.fn(),
    getChunk: jest.fn(),
    getAll: jest.fn(),
    updateThreadIncremental: jest.fn(),
    getNextIndex: jest.fn().mockResolvedValue(0),
    loadThread: jest.fn(),
    deleteReference: jest.fn(),
    deleteChunk: jest.fn(),
    saveThread: jest.fn(),
    search: jest.fn()
};

jest.unstable_mockModule('../extension/core/memory.js', () => mockMemory);

jest.unstable_mockModule('../extension/core/chunker.js', () => ({
    chunkAndRefine: jest.fn().mockResolvedValue([
        { chunk: 'Chunk 1 Original ' + 'word '.repeat(25), index: 0 },
        { chunk: 'Chunk 2 Original ' + 'word '.repeat(25), index: 1 }
    ])
}));

// Mock Helper to avoid side effects
jest.unstable_mockModule('../extension/core/helper.js', () => ({
    setupXenovaEnv: jest.fn(),
    getDeviceUUID: jest.fn(),
    estimateTokens: jest.fn(),
    copyToClipboard: jest.fn(),
    imagifyChunk: jest.fn(),
    sendMessageToTabWithInject: jest.fn()
}));

// 2. Dynamic Import of Module Under Test
const { ThreadletOrchestrator } = await import('../extension/core/orchestrator.js');

describe('Orchestrator Race Condition', () => {
    let orchestrator;
    let mockLLM;

    beforeEach(async () => {
        jest.clearAllMocks();

        mockLLM = {
            summarize: jest.fn().mockResolvedValue('Summary'),
            tag: jest.fn().mockResolvedValue(['tag1', 'tag2', 'tag3']),
            embed: jest.fn().mockResolvedValue([0.1, 0.2]),
            getConfig: jest.fn().mockResolvedValue({}),
            call: jest.fn(),
            validate: jest.fn().mockResolvedValue(true)
        };

        orchestrator = new ThreadletOrchestrator(mockLLM);

        // Default mocks
        mockMemory.getNextIndex.mockResolvedValue(0);
        // Default getChunk returns null (new chunk)
        mockMemory.getChunk.mockImplementation(async (id) => null);

        // Mock updateThread incremental
        mockMemory.updateThreadIncremental.mockResolvedValue({
            uuid: 'test', references: []
        });
    });

    test('should preserve user edits during concurrent chunk processing', async () => {
        // Setup Orchestrator state - REMOVED (Not used by implementation)
        // reference handling is done via memory mocks below

        // 1. Setup specific mock behavior to simulate user edit
        // When ingest calls getChunk(fresh) during step 5, we return a MODIFIED chunk for Chunk 0
        mockMemory.getChunk.mockImplementation(async (id) => {
            if (id && id.includes(':0')) { // Chunk 0
                return {
                    id: id,
                    uuid: 'user-1',
                    text: 'Chunk 1 EDITED BY USER ' + 'word '.repeat(25), // <--- USER EDIT (Long enough)
                    index: 0,
                    summary: 'Summary',
                    tags: ['tag1', 'tag2', 'tag3'], // satisfy tags.length > 2
                    edge_list: [],
                    chunk: 'Chunk 1 EDITED BY USER ' + 'word '.repeat(25)
                };
            }
            return null; // Chunk 1 is fresh/not edited
        });

        // 2. Run Ingest
        await orchestrator.ingest('New Ingest Text that triggers chunking', 'http://example.com', 'user-1');

        // 3. Verification
        const upsertCalls = mockMemory.upsertChunk.mock.calls;

        // We are looking for the LAST upsert call for Chunk 0
        // The orchestrator might upsert multiple times. We want to ensure the final state logic respected the storage state.
        const lastUpsertForChunk0 = upsertCalls
            .map(call => call[0])
            .filter(c => c.id && c.id.includes(':0'))
            .pop();

        console.log('Last upsert content:', lastUpsertForChunk0 ? lastUpsertForChunk0.text : 'UNDEFINED');

        // EXPECTATION: The text should be the EDITED version.
        if (!lastUpsertForChunk0) {
            throw new Error('Chunk 0 was not upserted');
        }
        expect(lastUpsertForChunk0.text).toBe('Chunk 1 EDITED BY USER ' + 'word '.repeat(25));
    });
});
