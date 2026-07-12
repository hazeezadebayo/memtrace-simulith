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

// Dynamically import modules under test to allow the mock to take effect
const { getDomainOntology } = await import('../simulith/src/data/ontology.js');
const { injectPerturbations } = await import('../simulith/src/tree/perturbation_engine.js');
const { estimateDynamicParameters, clearDynamicEstimationsCache } = await import('../simulith/src/tree/estimation_engine.js');
const { calculateTransition } = await import('../simulith/src/tree/transition_engine.js');
const { callLLM } = await import('../simulith/src/llm/ai.js');
const { buildTree } = await import('../simulith/src/tree/tree_builder.js');

describe('Tree Consequence Engine Integration Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (typeof clearDynamicEstimationsCache === 'function') {
      clearDynamicEstimationsCache();
    }
  });

  describe('1. Domain Ontology Canonical Alignment', () => {
    test('should retrieve ontology for canonical key "labor"', () => {
      const ontology = getDomainOntology('labor');
      expect(ontology).toBeDefined();
      expect(ontology.domain_name).toBe('labor');
      expect(ontology.variables.morale).toBeDefined();
    });

    test('should resolve case-insensitive domain name "Labor"', () => {
      const ontology = getDomainOntology('Labor');
      expect(ontology.domain_name).toBe('labor');
    });

    test('should resolve legacy/spaced domain "labor market" to "labor"', () => {
      const ontology = getDomainOntology('labor market');
      expect(ontology.domain_name).toBe('labor');
    });

    test('should fallback to common for unknown domain', () => {
      const ontology = getDomainOntology('non_existent_domain');
      expect(ontology.domain_name).toBe('common');
      expect(ontology.variables.execution_speed).toBeDefined();
    });
  });

  describe('2. Perturbation Engine Shock Injection', () => {
    test('should probabilistically inject a shock and return a valid shock ID', () => {
      // Seed Math.random to guarantee a shock triggers (roll > 0.85)
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.9);
      
      const operators = ['strategic_pivot'];
      const result = injectPerturbations(operators, 'labor');
      
      expect(result).toHaveLength(1);
      const shockObj = result[0];
      // Should match SOC_POS_XX or BUS_POS_XX or similar shock ID pattern
      expect(shockObj.operator_id).toMatch(/^[A-Z]{3}_(POS|NEG)_\d{2}$/);
      
      mockRandom.mockRestore();
    });

    test('should not inject shock if roll is below threshold', () => {
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      
      const operators = ['strategic_pivot'];
      const result = injectPerturbations(operators, 'labor');
      
      expect(result).toEqual(['strategic_pivot']);
      
      mockRandom.mockRestore();
    });
  });

  describe('3. Dynamic Parameter Estimation & Prompt Injection', () => {
    test('should estimate parameters for standard operator and call LLM', async () => {
      const mockResponse = JSON.stringify({
        automation_pressure: { mean: -0.2, variance: 0.05 }
      });
      callLLM.mockResolvedValue(mockResponse);

      const currentState = {
        variables: { morale: 0.6 }
      };

      const result = await estimateDynamicParameters('restructure_workflow', currentState, 'labor');
      
      expect(result).toEqual({
        automation_pressure: { mean: -0.2, variance: 0.05 }
      });
      expect(callLLM).toHaveBeenCalled();
      
      // Verify prompt contains operator description
      const promptArg = callLLM.mock.calls[0][0];
      expect(promptArg).toContain('restructure_workflow');
      expect(promptArg).toContain('Change schedules, process design');
    });

    test('should resolve shock, include shock description, and fallback variables for estimation', async () => {
      const mockResponse = JSON.stringify({
        morale: { mean: 0.15, variance: 0.02 }
      });
      callLLM.mockResolvedValue(mockResponse);

      const currentState = {
        variables: { morale: 0.25 }
      };

      // SOC_POS_01 is a valid shock ID from shocks.js
      const result = await estimateDynamicParameters('SOC_POS_01', currentState, 'labor');
      
      // Since it is a shock, all variables are estimated. Verify the mapped shock target is correct.
      expect(result.morale).toEqual({ mean: 0.15, variance: 0.02 });
      expect(result.retention).toBeDefined();
      expect(callLLM).toHaveBeenCalled();
      
      // Verify prompt contains shock description (third argument of callLLM)
      const promptArg = callLLM.mock.calls[0][0].toLowerCase();
      expect(promptArg).toContain('soc_pos_01');
      expect(promptArg).toContain('civic renewal');
    });
  });

  describe('4. Transition Calculation', () => {
    test('should transition state with standard operator and base effects', () => {
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const currentState = {
        id: 'S_ROOT',
        variables: {
          morale: 0.5,
          retention: 0.5,
          wage_pressure: 0.5
        },
        depth: 0,
        instability: 0.0
      };

      const projectedWeights = {
        raise_wages: 1.0
      };

      const result = calculateTransition(currentState, 'raise_wages', projectedWeights, 'labor');
      
      expect(result.parent).toBe('S_ROOT');
      expect(result.depth).toBe(1);
      
      // expected_variables track the pure mean without stochastic Box-Muller noise:
      expect(result.expected_variables.morale).toBeCloseTo(0.6155, 4);
      expect(result.expected_variables.retention).toBeCloseTo(0.6593, 4);
      expect(result.expected_variables.wage_pressure).toBeCloseTo(0.68, 4);

      // variables track stochastically sampled path:
      expect(result.variables.morale).toBeCloseTo(0.4978, 4);
      expect(result.variables.retention).toBeCloseTo(0.5415, 4);
      expect(result.variables.wage_pressure).toBeCloseTo(0.5623, 4);

      mockRandom.mockRestore();
    });

    test('should transition state correctly under shock events with dynamic estimation fallbacks', () => {
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const currentState = {
        id: 'S_ROOT',
        variables: {
          morale: 0.6,
          retention: 0.25,
          wage_pressure: 0.65
        },
        depth: 0,
        instability: 0.0
      };

      const result = calculateTransition(currentState, 'SOC_POS_01', {}, 'labor');
      
      expect(result.depth).toBe(1);
      
      // expected_variables track the pure mean (shocks do not shift expected mean directly, only variance):
      expect(result.expected_variables.morale).toBeCloseTo(0.60, 4);
      expect(result.expected_variables.retention).toBeCloseTo(0.25, 4);
      expect(result.expected_variables.wage_pressure).toBeCloseTo(0.65, 4);

      // variables track stochastically sampled path under shock:
      expect(result.variables.morale).toBeCloseTo(0.4758, 4);
      expect(result.variables.retention).toBeCloseTo(0.1258, 4);
      expect(result.variables.wage_pressure).toBeCloseTo(0.5258, 4);

      mockRandom.mockRestore();
    });
  });

  describe('5. Tree Builder & Progress Tracking', () => {
    test('should build tree and invoke progress callback', async () => {
      callLLM.mockResolvedValue(JSON.stringify({
        morale: 0.8,
        retention: 0.15,
        wage_pressure: 0.9,
        utility_scalar: 0.85,
        mean: 0.05,
        variance: 0.01
      }));

      const progressCalls = [];
      const onProgress = (prog) => {
        progressCalls.push(prog);
      };

      const result = await buildTree(
        "strategic pivot",
        "constraints info",
        "labor",
        1,
        1,
        onProgress
      );

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.tree.nodes.length).toBeGreaterThan(0);
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0].nodesComputed).toBe(1);
    });
  });
});
