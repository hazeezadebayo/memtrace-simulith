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

// Dynamically import query_adapter to allow the mock to take effect
const { extractDominantPaths, explainDominantFutures } = await import('../simulith/src/tree/query_adapter.js');
const { callLLM } = await import('../simulith/src/llm/ai.js');

describe('Query Adapter Engine Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractDominantPaths', () => {
    test('should calculate expected utility correctly using path-integrated expectation', () => {
      // Create a test tree
      // Root (utility_scalar: 0.5)
      // Edge to A (prob: 0.8, utility_scalar: 1.0)
      // Edge to B (prob: 0.2, utility_scalar: -1.0)
      const tree = {
        nodes: [
          { id: 'ROOT', utility_scalar: 0.5, utilities: { user: 0.5 } },
          { id: 'A', utility_scalar: 1.0, utilities: { user: 1.0 } },
          { id: 'B', utility_scalar: -1.0, utilities: { user: -1.0 } }
        ],
        edges: [
          { from: 'ROOT', to: 'A', probability: 0.8, operator: 'op_a' },
          { from: 'ROOT', to: 'B', probability: 0.2, operator: 'op_b' }
        ]
      };

      const topPaths = extractDominantPaths(tree, 'ROOT', 2);

      expect(topPaths).toHaveLength(2);
      
      // Path A: expected utility = 0.5 + 0.8 * 1.0 = 1.3
      // Path B: expected utility = 0.5 + 0.2 * -1.0 = 0.3
      // Top paths should be sorted by score descending (Path A first)
      const pathA = topPaths.find(p => p.terminalNode.id === 'A');
      const pathB = topPaths.find(p => p.terminalNode.id === 'B');

      expect(pathA.score).toBeCloseTo(1.3, 4);
      expect(pathB.score).toBeCloseTo(0.3, 4);
      
      // In the final returned list, they are sorted by normalized probability
      // Path A: 0.8 / 1.0 = 0.8 prob
      // Path B: 0.2 / 1.0 = 0.2 prob
      // Path A has higher probability, so it should be first
      expect(topPaths[0].terminalNode.id).toBe('A');
      expect(topPaths[1].terminalNode.id).toBe('B');
    });
  });

  describe('explainDominantFutures', () => {
    const mockDecision = "Should I deploy?";
    const mockPaths = [
      {
        cumulativeProb: 0.8,
        terminalUtility: 1.0,
        operators: [{ operator: 'op_a', probability: 0.8 }],
        terminalNode: { id: 'A', utilities: { user: 1.0 } }
      }
    ];
    const mockDecisionSpace = {
      variable_labels: {},
      operator_labels: {},
      stakeholder_labels: {}
    };

    test('should parse standard uppercase format', async () => {
      const mockLLMResponse = `
[FUTURE 1]
TITLE: Standard Future Title
PROBABILITY_LABEL: Likely (80%)
OUTCOME: The system will run perfectly.
MAIN_RISK: None expected.
MAIN_UPSIDE: High productivity.
SIGNAL: Active traffic.
ACTION: Monitor dashboard.
SENTIMENT: positive
`;
      callLLM.mockResolvedValue(mockLLMResponse);

      const result = await explainDominantFutures(mockDecision, mockPaths, mockDecisionSpace);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Standard Future Title");
      expect(result[0].probability_label).toBe("Likely (80%)");
      expect(result[0].main_risk).toBe("None expected.");
      expect(result[0].main_upside).toBe("High productivity.");
      expect(result[0].sentiment).toBe("positive");
    });

    test('should parse markdown formatted text', async () => {
      const mockLLMResponse = `
### Future 1
- **Title**: Markdown Title
- **Probability Label**: Likely (80%)
- **Outcome**: The system will run perfectly.
- **Main Risk**: Core risk.
- **Main Upside**: Core upside.
- **Signal**: Active traffic.
- **Action**: Monitor dashboard.
- **Sentiment**: positive
`;
      callLLM.mockResolvedValue(mockLLMResponse);

      const result = await explainDominantFutures(mockDecision, mockPaths, mockDecisionSpace);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Markdown Title");
      expect(result[0].probability_label).toBe("Likely (80%)");
      expect(result[0].main_risk).toBe("Core risk.");
      expect(result[0].main_upside).toBe("Core upside.");
    });

    test('should parse case, spaces, and hyphens in keys', async () => {
      const mockLLMResponse = `
Future 1:
title: Spaced Keys Title
probability label: 80%
outcome: The system will run perfectly.
main-risk: Hyphenated risk.
main upside: Spaced upside.
signal: Active traffic.
action: Monitor dashboard.
sentiment: positive
`;
      callLLM.mockResolvedValue(mockLLMResponse);

      const result = await explainDominantFutures(mockDecision, mockPaths, mockDecisionSpace);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Spaced Keys Title");
      expect(result[0].probability_label).toBe("80%");
      expect(result[0].main_risk).toBe("Hyphenated risk.");
      expect(result[0].main_upside).toBe("Spaced upside.");
    });

    test('should parse JSON fallback with uppercase keys', async () => {
      const mockLLMResponse = `
[
  {
    "TITLE": "JSON Title",
    "PROBABILITY_LABEL": "Likely (80%)",
    "OUTCOME": "The system will run perfectly.",
    "MAIN_RISK": "JSON risk.",
    "MAIN_UPSIDE": "JSON upside.",
    "SIGNAL": "Active traffic.",
    "ACTION": "Monitor dashboard.",
    "SENTIMENT": "positive"
  }
]
`;
      callLLM.mockResolvedValue(mockLLMResponse);

      const result = await explainDominantFutures(mockDecision, mockPaths, mockDecisionSpace);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("JSON Title");
      expect(result[0].probability_label).toBe("Likely (80%)");
      expect(result[0].main_risk).toBe("JSON risk.");
      expect(result[0].main_upside).toBe("JSON upside.");
    });

    test('should parse JSON fallback with wrapper object', async () => {
      const mockLLMResponse = `
{
  "futures": [
    {
      "TITLE": "Wrapped JSON Title",
      "PROBABILITY_LABEL": "Likely (80%)",
      "OUTCOME": "The system will run perfectly.",
      "MAIN_RISK": "Wrapped JSON risk.",
      "MAIN_UPSIDE": "Wrapped JSON upside.",
      "SIGNAL": "Active traffic.",
      "ACTION": "Monitor dashboard.",
      "SENTIMENT": "positive"
    }
  ]
}
`;
      callLLM.mockResolvedValue(mockLLMResponse);

      const result = await explainDominantFutures(mockDecision, mockPaths, mockDecisionSpace);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Wrapped JSON Title");
      expect(result[0].probability_label).toBe("Likely (80%)");
      expect(result[0].main_risk).toBe("Wrapped JSON risk.");
      expect(result[0].main_upside).toBe("Wrapped JSON upside.");
    });

    test('should dynamically generate fallback narratives when LLM returns mock or empty response', async () => {
      callLLM.mockResolvedValue("Mock response");

      const paths = [
        {
          cumulativeProb: 0.36,
          terminalUtility: 0.76,
          operators: [
            { operator: 'conduct_cost_benefit', probability: 0.33 },
            { operator: 'prioritize_features', probability: 0.52 }
          ],
          terminalNode: {
            id: 'node_1',
            variables: { customer_satisfaction: 0.82 },
            utilities: { users: 0.76, opposition: -0.39 }
          }
        }
      ];

      const decisionSpace = {
        variable_labels: { customer_satisfaction: "customer satisfaction" },
        operator_labels: {
          conduct_cost_benefit: "Conduct a cost-benefit analysis of feature development",
          prioritize_features: "Prioritize features based on customer impact"
        },
        stakeholder_labels: { users: "My main supporters or users", opposition: "Opposing groups" }
      };

      const result = await explainDominantFutures("Should I quit my project?", paths, decisionSpace);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Progressive Path via Conduct a cost-benefit analysis of feature development to Prioritize features based on customer impact");
      expect(result[0].probability_label).toBe("Possible (36%)");
      expect(result[0].outcome).toContain("Conduct a cost-benefit analysis of feature development");
      expect(result[0].outcome).toContain("customer satisfaction");
      expect(result[0].main_upside).toContain("My main supporters or users");
      expect(result[0].main_upside).toContain("76");
      expect(result[0].main_risk).toContain("Opposing groups");
      expect(result[0].main_risk).toContain("39");
      expect(result[0].sentiment).toBe("positive");
    });

    test('should reject duplicate/similar titles and fall back to mathematically distinct titles', async () => {
      const mockLLMResponse = `
[
  {
    "TITLE": "Identical Title",
    "PROBABILITY_LABEL": "Likely (80%)",
    "OUTCOME": "The system will run perfectly.",
    "MAIN_RISK": "None.",
    "MAIN_UPSIDE": "None.",
    "SIGNAL": "Active traffic.",
    "ACTION": "Monitor dashboard.",
    "SENTIMENT": "positive"
  },
  {
    "TITLE": "Identical Title",
    "PROBABILITY_LABEL": "Possible (30%)",
    "OUTCOME": "The system will run moderately.",
    "MAIN_RISK": "None.",
    "MAIN_UPSIDE": "None.",
    "SIGNAL": "Active traffic.",
    "ACTION": "Monitor dashboard.",
    "SENTIMENT": "positive"
  }
]
`;
      callLLM.mockResolvedValue(mockLLMResponse);

      const paths = [
        {
          cumulativeProb: 0.8,
          terminalUtility: 1.0,
          operators: [{ operator: 'op_a', probability: 0.8 }],
          terminalNode: { id: 'A', utilities: { user: 1.0 } }
        },
        {
          cumulativeProb: 0.3,
          terminalUtility: 0.5,
          operators: [
            { operator: 'op_a', probability: 0.8 },
            { operator: 'op_b', probability: 0.3 }
          ],
          terminalNode: { id: 'B', utilities: { user: 0.5 } }
        }
      ];

      const decisionSpace = {
        variable_labels: {},
        operator_labels: {
          op_a: "First Step",
          op_b: "Second Step"
        },
        stakeholder_labels: {}
      };

      const result = await explainDominantFutures("Should I deploy?", paths, decisionSpace);

      expect(result).toHaveLength(2);
      // First one is allowed to keep the LLM-generated title
      expect(result[0].title).toBe("Identical Title");
      // Second one should be flagged as duplicate and replaced with its unique fallback title
      expect(result[1].title).toBe("Progressive Path via First Step to Second Step");
    });
  });
});
