import { jest } from '@jest/globals';

// Mock node-llama-cpp to avoid loading a 4GB model binary
jest.unstable_mockModule('node-llama-cpp', () => {
    class DummyLlamaContext {
        getSequence() {
            return {
                disposed: false,
                clearHistory: jest.fn()
            };
        }
    }
    class DummyLlamaModel {
        createContext() {
            return new DummyLlamaContext();
        }
    }
    class DummyLlama {
        loadModel() {
            return new DummyLlamaModel();
        }
    }
    return {
        getLlama: async () => new DummyLlama(),
        LlamaChatSession: class {
            constructor({ contextSequence, chatWrapper }) {
                this.sequence = contextSequence;
                this.chatWrapper = chatWrapper;
            }
            async prompt(promptText, options) {
                // If signal is already aborted, throw AbortError immediately
                if (options.signal?.aborted) {
                    const err = new Error('aborted');
                    err.name = 'AbortError';
                    throw err;
                }
                // Simulate generation by yielding, but if signal aborts, throw AbortError
                return new Promise((resolve, reject) => {
                    const onAbort = () => {
                        const err = new Error('aborted');
                        err.name = 'AbortError';
                        reject(err);
                    };
                    options.signal?.addEventListener('abort', onAbort);
                    setTimeout(() => {
                        options.signal?.removeEventListener('abort', onAbort);
                        resolve('dummy response');
                    }, 50);
                });
            }
        },
        JinjaTemplateChatWrapper: class {}
    };
});

const { getOfflineLLM } = await import('../extension/llm/offline_llm.js');

describe('OfflineLLM Cancellation Enforcement', () => {
    let offlineLLM;

    beforeAll(async () => {
        offlineLLM = await getOfflineLLM();
        // Force mock initialized state
        offlineLLM.initialized = true;
        offlineLLM.session = {
            sequence: {
                disposed: false,
                clearHistory: jest.fn()
            }
        };
        offlineLLM.context = {
            getSequence: () => ({
                disposed: false,
                clearHistory: jest.fn()
            })
        };
        offlineLLM.chatWrapper = {};
    });

    test('should throw immediately if called with an already aborted signal', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            offlineLLM.generate('test prompt', controller.signal)
        ).rejects.toThrow('Simulation Cancelled by user.');
    });

    test('should abort mid-generation when signal is aborted', async () => {
        const controller = new AbortController();

        // Abort signal mid-way through prompt promise
        setTimeout(() => {
            controller.abort();
        }, 15);

        await expect(
            offlineLLM.generate('test prompt', controller.signal)
        ).rejects.toThrow('Simulation Cancelled by user.');
    });
});
