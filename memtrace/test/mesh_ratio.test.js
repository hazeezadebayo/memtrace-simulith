import { generateMesh } from '../simulith/src/agents/mesh.js';
import { PSEUDO_ARCHETYPES } from '../simulith/src/data/manifest.js';

describe('Mesh Generator 1:9 Ratio', () => {
  test('should generate a 12-agent population with exactly 10% (1:9 ratio) pseudo-archetypes', async () => {
    const scenario = {
      question: 'Should we adopt AI agents for coding?',
      domain: 'tech',
      facts: [],
      sources: []
    };

    const graph = {
      nodes: [
        { id: 'core_premise', type: 'concept', label: 'Core Premise' }
      ],
      edges: [],
      adjacency: new Map(),
      nodeById: new Map([
        ['core_premise', { id: 'core_premise', type: 'concept', label: 'Core Premise' }]
      ])
    };

    const agents = await generateMesh(scenario, 'test-sim-id', 12, graph);

    expect(agents).toHaveLength(12);

    const pseudoNames = PSEUDO_ARCHETYPES.map(p => p.name);

    // Verify agent at index 0 (1st agent) is a pseudo-archetype
    const baseName0 = agents[0].name.replace(/_\d+$/, '');
    expect(pseudoNames).toContain(baseName0);

    // Verify agent at index 10 (11th agent) is a pseudo-archetype
    const baseName10 = agents[10].name.replace(/_\d+$/, '');
    expect(pseudoNames).toContain(baseName10);

    // Verify all other indices are domain-specific (not in pseudoNames)
    for (let i = 0; i < agents.length; i++) {
      if (i !== 0 && i !== 10) {
        const baseName = agents[i].name.replace(/_\d+$/, '');
        expect(pseudoNames).not.toContain(baseName);
      }
    }
  });
});
