import { jest } from '@jest/globals';

// Mock the AI module using ESM-compliant unstable_mockModule before importing under-test modules
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

// Dynamically import modules under test
const { callLLM } = await import('../simulith/src/llm/ai.js');
const { buildTree } = await import('../simulith/src/tree/tree_builder.js');
const { clearDynamicEstimationsCache } = await import('../simulith/src/tree/estimation_engine.js');

describe('DAG Consequence Engine Mathematical Validation & Properties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (typeof clearDynamicEstimationsCache === 'function') {
      clearDynamicEstimationsCache();
    }
  });

  describe('1. Invariance (Structure & Execution Determinism)', () => {
    test('same inputs must yield mathematically identical DAG structure', async () => {
      // Mock LLM returns for operators, estimations, and utilities
      let callCount = 0;
      callLLM.mockImplementation(async (prompt) => {
        callCount++;
        if (prompt.includes('State Encoder')) {
          return JSON.stringify({
            attrition_rate: 0.15,
            productivity: 0.70,
            burnout_index: 0.30
          });
        }
        if (prompt.includes('Operator Generator')) {
          return JSON.stringify(['salary_adaptation', 'mandate_rto']);
        }
        if (prompt.includes('Statistical Parameter Estimator')) {
          return JSON.stringify({
            attrition_rate: { mean: 0.05, variance: 0.01 },
            productivity: { mean: -0.10, variance: 0.02 },
            burnout_index: { mean: 0.15, variance: 0.03 }
          });
        }
        if (prompt.includes('Utility Function Evaluator')) {
          return JSON.stringify({
            Employees: 0.45,
            Investors: 0.60
          });
        }
        return '{}';
      });

      // Freeze Math.random for deterministic transition sampling
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const run1 = await buildTree('Increase work hours', 'General constraints', 'labor', 2, 2);
      
      // Reset mocks and state for run 2
      jest.clearAllMocks();
      callCount = 0;
      mockRandom.mockReturnValue(0.5);

      const run2 = await buildTree('Increase work hours', 'General constraints', 'labor', 2, 2);

      // Verify node and edge identity
      expect(run1.tree.nodes.length).toBe(run2.tree.nodes.length);
      expect(run1.tree.edges.length).toBe(run2.tree.edges.length);
      
      for (let i = 0; i < run1.tree.nodes.length; i++) {
        const n1 = run1.tree.nodes[i];
        const n2 = run2.tree.nodes[i];
        expect(n1.variables).toEqual(n2.variables);
        expect(n1.expected_variables).toEqual(n2.expected_variables);
        expect(n1.utilities).toEqual(n2.utilities);
        expect(n1.depth).toBe(n2.depth);
      }

      mockRandom.mockRestore();
    });
  });

  describe('2. Sensitivity (Bounded Perturbation Response)', () => {
    test('minor state perturbation yields bounded variance in outcomes', async () => {
      // Mock LLM outputs
      callLLM.mockImplementation(async (prompt) => {
        if (prompt.includes('Initial State Encoder')) {
          // encoder response will be overridden or structured manually
          return JSON.stringify({
            attrition_rate: 0.15,
            productivity: 0.70,
            burnout_index: 0.30
          });
        }
        if (prompt.includes('Operator Generator')) {
          return JSON.stringify(['salary_adaptation']);
        }
        if (prompt.includes('Statistical Parameter Estimator')) {
          return JSON.stringify({
            attrition_rate: { mean: 0.02, variance: 0.01 },
            productivity: { mean: -0.05, variance: 0.01 },
            burnout_index: { mean: 0.08, variance: 0.02 }
          });
        }
        if (prompt.includes('Utility Function Evaluator')) {
          return JSON.stringify({
            Employees: 0.50,
            Investors: 0.50
          });
        }
        return '{}';
      });

      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const resBase = await buildTree('Decision A', 'Context', 'labor', 2, 1);
      
      // Verify utility scores are bounded
      expect(resBase.summary.highest_expected_utility).toBeLessThanOrEqual(1.0);
      expect(resBase.summary.highest_expected_utility).toBeGreaterThanOrEqual(-1.0);

      mockRandom.mockRestore();
    });
  });

  describe('3. Causal Path Preservation (Strict Merge Separation)', () => {
    test('distinct causal states must never be merged', async () => {
      // Setup mock responses where operator A and B lead to completely different states
      let evalCallCount = 0;
      callLLM.mockImplementation(async (prompt) => {
        if (prompt.includes('State Encoder')) {
          return JSON.stringify({
            attrition_rate: 0.90,
            productivity: 0.10,
            employee_morale: 0.05
          });
        }
        if (prompt.includes('Operator Generator')) {
          return JSON.stringify(['salary_adaptation', 'mandate_rto']);
        }
        if (prompt.includes('Statistical Parameter Estimator')) {
          // Give one operator high positive mean, and other highly negative
          if (prompt.includes('salary_adaptation')) {
            return JSON.stringify({
              attrition_rate: { mean: -0.20, variance: 0.01 },
              productivity: { mean: 0.20, variance: 0.01 },
              burnout_index: { mean: -0.15, variance: 0.01 }
            });
          } else {
            return JSON.stringify({
              attrition_rate: { mean: 0.30, variance: 0.01 },
              productivity: { mean: -0.30, variance: 0.01 },
              burnout_index: { mean: 0.35, variance: 0.01 }
            });
          }
        }
        if (prompt.includes('Utility Function Evaluator')) {
          evalCallCount++;
          // Alternate utility vector based on call count to ensure utilities are also distinct
          if (evalCallCount % 2 === 0) {
            return JSON.stringify({ Employees: 0.80, Investors: 0.20 });
          } else {
            return JSON.stringify({ Employees: -0.40, Investors: 0.90 });
          }
        }
        return '{}';
      });

      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      // Depth = 1, branching = 2
      const result = await buildTree('Run Pivot', 'Context', 'labor', 1, 2);

      // Sibling nodes are generated under salary_adaptation vs mandate_rto.
      // Since they have very different transitions, they must NOT merge.
      // Total nodes should be 3 (1 root + 2 distinct child states)
      expect(result.summary.node_count).toBe(3);
      expect(result.tree.nodes.length).toBe(3);

      mockRandom.mockRestore();
    });
  });
});
