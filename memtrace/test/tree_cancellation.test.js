import { jest } from '@jest/globals';
import { AsyncLocalStorage } from 'async_hooks';

// Mock the AI module
jest.unstable_mockModule('../simulith/src/llm/ai.js', () => ({
  callLLM: jest.fn(),
  parseJson: (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}));

const { buildTree } = await import('../simulith/src/tree/tree_builder.js');
const { withBackoff } = await import('../extension/core/llm-limiter.js');

describe('Simulation Cancellation & Signal Propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should throw immediately if buildTree starts with an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    global.memtraceLlmContext = new AsyncLocalStorage();
    const storeContext = {
      uuid: 'test-user',
      signal: controller.signal
    };

    await expect(
      new Promise((resolve, reject) => {
        global.memtraceLlmContext.run(storeContext, async () => {
          try {
            await buildTree('test decision', 'constraints', 'labor', 2, 2);
            resolve('done');
          } catch (err) {
            reject(err);
          }
        });
      })
    ).rejects.toThrow('Simulation Cancelled by user.');
  });

  test('should throw when signal is aborted mid-backoff sleep in withBackoff', async () => {
    const controller = new AbortController();
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('502 Bad Gateway'))
      .mockResolvedValue('success');

    // Abort after 50ms so it aborts during the backoff sleep
    setTimeout(() => {
      controller.abort();
    }, 50);

    const startTime = Date.now();
    await expect(
      withBackoff(mockFn, 3, 200, controller.signal)
    ).rejects.toThrow('Simulation Cancelled by user.');

    const duration = Date.now() - startTime;
    // Delay would normally be 200ms+ jitter, but cancellation should abort the sleep early.
    expect(duration).toBeLessThan(350);
  });
});
