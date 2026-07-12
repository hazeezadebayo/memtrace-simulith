import { jest } from '@jest/globals';

jest.unstable_mockModule('../extension/core/llm_agent.js', () => ({
  callLLM: jest.fn(),
  checkInjectionGuardrail: jest.fn().mockResolvedValue({ safe: true })
}));

jest.unstable_mockModule('../simulith/src/automation/utils.js', () => {
  return {
    isCancellationError: (e, signal) => {
      if (signal?.aborted) return true;
      if (!e) return false;
      const name = e.name || '';
      const msg = e.message || String(e);
      return (
        name === 'AbortError' ||
        msg === 'Simulation Cancelled by user.' ||
        msg.includes('Simulation Cancelled by user.') ||
        msg.includes('aborted') ||
        msg.includes('AbortError') ||
        msg.includes('CANCELLED')
      );
    },
    runCouncil: jest.fn(),
    runMesh: jest.fn(),
    runTree: jest.fn(),
    setAutomationState: jest.fn(),
    logAutomation: jest.fn(),
    clearAutomationLogs: jest.fn()
  };
});

const { routeQuery } = await import('../simulith/src/automation/epistemology_router.js');
const { runDivergenceAnalysis } = await import('../simulith/src/automation/divergence_engine.js');
const { runCouncil, runMesh, runTree } = await import('../simulith/src/automation/utils.js');
const { callLLM } = await import('../extension/core/llm_agent.js');

describe('Router & Divergence Cancellation Tests', () => {
  const baseUrl = 'http://127.0.0.1:3106';
  const token = 'test-token';
  const payload = { uuid: 'test-user', question: 'Should we launch product X?' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Router Mode (routeQuery)', () => {
    test('should throw immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        routeQuery(baseUrl, token, payload, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');

      expect(callLLM).not.toHaveBeenCalled();
    });

    test('should throw if signal is aborted during routing LLM call', async () => {
      const controller = new AbortController();
      callLLM.mockImplementation(async (provider, key, prompt, model, options) => {
        controller.abort();
        throw new Error('Simulation Cancelled by user.');
      });

      await expect(
        routeQuery(baseUrl, token, payload, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');
    });

    test('should abort and not start sub-simulation if aborted after routing LLM call but before execution', async () => {
      const controller = new AbortController();
      callLLM.mockResolvedValue(JSON.stringify({ mode: 'council', reasoning: 'Strategic query' }));

      // Intercept execution path by aborting immediately after callLLM finishes
      const originalCallLLM = callLLM;
      callLLM.mockImplementationOnce(async (...args) => {
        const res = await originalCallLLM.bind(null, ...args)();
        controller.abort();
        return res;
      });

      await expect(
        routeQuery(baseUrl, token, payload, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');

      expect(runCouncil).not.toHaveBeenCalled();
    });

    test('should propagate cancellation error if sub-simulation gets aborted', async () => {
      const controller = new AbortController();
      callLLM.mockResolvedValue(JSON.stringify({ mode: 'council', reasoning: 'Strategic query' }));
      runCouncil.mockRejectedValue(new Error('Simulation Cancelled by user.'));

      await expect(
        routeQuery(baseUrl, token, payload, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');
    });
  });

  describe('Divergence Mode (runDivergenceAnalysis)', () => {
    test('should throw immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        runDivergenceAnalysis(baseUrl, token, payload, true, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');

      expect(runCouncil).not.toHaveBeenCalled();
    });

    test('should halt sequential execution immediately if aborted after Council but before Mesh', async () => {
      const controller = new AbortController();
      runCouncil.mockImplementation(async () => {
        controller.abort();
        return { recommendation: { title: 'Council recommendation' } };
      });

      await expect(
        runDivergenceAnalysis(baseUrl, token, payload, true, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');

      expect(runCouncil).toHaveBeenCalled();
      expect(runMesh).not.toHaveBeenCalled();
      expect(runTree).not.toHaveBeenCalled();
    });

    test('should halt sequential execution immediately if aborted after Mesh but before Tree', async () => {
      const controller = new AbortController();
      runCouncil.mockResolvedValue({ recommendation: { title: 'Council recommendation' } });
      runMesh.mockImplementation(async () => {
        controller.abort();
        return { report: { verdict: { stance: 'neutral' } } };
      });

      await expect(
        runDivergenceAnalysis(baseUrl, token, payload, true, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');

      expect(runCouncil).toHaveBeenCalled();
      expect(runMesh).toHaveBeenCalled();
      expect(runTree).not.toHaveBeenCalled();
    });

    test('should fail fast in parallel mode if any simulation is cancelled', async () => {
      const controller = new AbortController();
      
      runCouncil.mockResolvedValue({ recommendation: { title: 'Council recommendation' } });
      runMesh.mockRejectedValue(new Error('Simulation Cancelled by user.'));
      runTree.mockResolvedValue({ dominantFutures: [] });

      await expect(
        runDivergenceAnalysis(baseUrl, token, payload, false, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');
    });

    test('should abort before synthesis if cancelled after parallel/sequential runs complete', async () => {
      const controller = new AbortController();
      runCouncil.mockResolvedValue({ recommendation: { title: 'Council recommendation' } });
      runMesh.mockResolvedValue({ report: { verdict: { stance: 'neutral' } } });
      runTree.mockResolvedValue({ dominantFutures: [] });

      // Abort right after the sub-simulations complete
      const originalRunTree = runTree;
      runTree.mockImplementationOnce(async (...args) => {
        const res = await originalRunTree.bind(null, ...args)();
        controller.abort();
        return res;
      });

      await expect(
        runDivergenceAnalysis(baseUrl, token, payload, true, controller.signal)
      ).rejects.toThrow('Simulation Cancelled by user.');

      expect(callLLM).not.toHaveBeenCalled();
    });
  });
});
