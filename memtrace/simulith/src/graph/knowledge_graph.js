/* ==================================================================
   simulith/src/knowledge_graph.js
   Extracts and manages the Knowledge Graph (Nodes, Edges, Schema Types)
   and applies unexpected variables / external shocks to edges.
   ================================================================== */

import { buildScenarioGraph } from './graph_ontology.js';
import { callLLM } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

/**
 * Dynamically builds a factual knowledge graph based on a user decision scenario.
 * Structured parsing prompts prevent the underlying 4B model from getting lazy.
 */
export async function buildKnowledgeGraph(scenario) {
  const baseGraph = await buildScenarioGraph(scenario);

  if (!baseGraph || !Array.isArray(baseGraph.nodes) || baseGraph.nodes.length === 0) {
    throw new Error("Failed to extract valid scenario graph: No nodes could be dynamically mapped from the question or facts.");
  }

  const scenarioFacts = Array.isArray(scenario.facts) ? scenario.facts : [];
  const variables = baseGraph.nodes.map(n => `- ${n.id} (${n.label} - Type: ${n.type})`).join('\n');

  const prompt = `
You are a system dynamics analyst. Analyze the following scenario and facts:
Scenario: "${scenario.question}"
Facts:
${scenarioFacts.map(f => `- ${f}`).join('\n')}

For each variable below, determine its current real-world status in this scenario:
1. "magnitude": a float from 0.0 (no impact/severity) to 1.0 (extremely high impact/severity/urgency).
2. "polarity": a float from -1.0 (extremely negative state/worsening) to 1.0 (extremely positive state/improving).

Variables to rate:
${variables}

Output raw JSON ONLY matching this exact key-value mapping (do not output any other text or markdown fences):
{
  "variable_id": { "magnitude": 0.5, "polarity": -0.2 }
}
`.trim();

  let annotations = {};
  try {
    const response = await callLLM(prompt);
    const parsed = _parseCleanJson(response);
    if (parsed && typeof parsed === 'object') {
      annotations = parsed;
    }
  } catch (err) {
    console.error('[KG] LLM micro-annotation failed, falling back to neutral defaults:', err.message);
  }

  const sanitizedNodes = baseGraph.nodes.map(n => {
    const ann = annotations[n.id] || {};
    let magnitude = 0.5;
    let polarity = 0.0;

    if (typeof ann.magnitude === 'number') {
      magnitude = Math.max(0, Math.min(1, ann.magnitude));
    }
    if (typeof ann.polarity === 'number') {
      polarity = Math.max(-1, Math.min(1, ann.polarity));
    }

    return {
      id: n.id,
      label: n.label,
      type: n.type || 'General',
      stability: n.stability || 'stable',
      magnitude,
      polarity
    };
  });

  const sanitizedEdges = baseGraph.edges.map(e => ({
    src: e.src,
    dst: e.dst,
    rel: e.rel || 'interacts_with',
    status: 'STABLE',
    weight: e.weight ?? 1.0,
    rationale: e.rationale || `${e.src} interacts with ${e.dst}`
  })).filter(e => sanitizedNodes.some(n => n.id === e.src) && sanitizedNodes.some(n => n.id === e.dst));

  const schemaTypes = Array.from(new Set(sanitizedNodes.map(n => n.type)));

  return {
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
    schemaTypes
  };
}

/**
 * Applies random or targeted shock factors directly to relevant areas of the graph web
 */
export function applyShockToGraph(graph, shockEvent) {
  if (!graph || !Array.isArray(graph.edges) || !Array.isArray(graph.nodes)) return graph;
  if (graph.nodes.length === 0) return graph;

  const shockDesc = shockEvent && shockEvent.description ? String(shockEvent.description).toLowerCase() : '';
  const shockTitle = shockEvent && shockEvent.title ? String(shockEvent.title).toLowerCase() : '';
  
  // Advanced Targeted Filtering Heuristic: Attempt to discover which node matches the incoming crisis profile
  let targetNodes = graph.nodes.filter(n => 
    (shockDesc.includes(n.id) || shockDesc.includes(n.label.toLowerCase()) ||
    shockTitle.includes(n.id) || shockTitle.includes(n.label.toLowerCase())) &&
    graph.edges.some(e => e.src === n.id || e.dst === n.id)
  );

  // Fallback to general stable systems if targeted lookups fail to match
  if (targetNodes.length === 0) {
    targetNodes = graph.nodes.filter(n => n.stability === 'stable' && graph.edges.some(e => e.src === n.id || e.dst === n.id));
  }
  if (targetNodes.length === 0) {
    targetNodes = graph.nodes.filter(n => graph.edges.some(e => e.src === n.id || e.dst === n.id));
  }
  if (targetNodes.length === 0) {
    targetNodes = graph.nodes; // Extreme fallback to any available node
  }
 
  // Destabilize the primary candidate node
  const selectedNode = targetNodes[Math.floor(Math.random() * targetNodes.length)];
  selectedNode.stability = 'destabilized';

  // Cascade the shock to all nodes sharing the same ontological type
  for (const node of graph.nodes) {
    if (node.id !== selectedNode.id && node.type === selectedNode.type && node.stability === 'stable') {
      node.stability = 'STRESSED';
    }
  }

  // Disrupt all edges attached directly to our impacted primary node
  const relevantEdges = graph.edges.filter(e => 
    (e.src === selectedNode.id || e.dst === selectedNode.id) && e.status === 'STABLE'
  );

  for (const edge of relevantEdges) {
    edge.status = 'DISRUPTED';
    edge.evidence = shockEvent ? shockEvent.description : 'Stochastic system shock mutation';
  }

  return graph;
}

/**
 * Returns a high-scannability scannable Markdown summary of the environment data loops.
 * Optimizes prompt digestion metrics inside Qwen/Phi local execution runs.
 */
export function getGraphSummary(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return 'Factual Landscape: Empty System Graph.';

  const nodeStrings = graph.nodes.map(n => {
    const polarityStr = n.polarity > 0 ? `+${n.polarity}` : `${n.polarity}`;
    const stateStr = `Magnitude: ${n.magnitude || 0.5}, Polarity: ${polarityStr || 0.0}`;
    const stabilityStr = n.stability === 'destabilized' ? ' [CRITICAL]' : '';
    return `- ${n.label} [${n.type}${stabilityStr}] (${stateStr})`;
  });
  
  const edgeLines = (graph.edges || []).map(e => {
    const contextStr = e.evidence ? ` (Due to: ${e.evidence})` : '';
    return `- ${e.src} -> [${e.rel} (${e.status})] -> ${e.dst}${contextStr}`;
  });

  let summary = `### SYSTEM FACTUAL LANDSCAPE GRAPH\n`;
  summary += `Active System Nodes & Realities:\n${nodeStrings.join('\n') || 'None'}\n\n`;
  summary += `Relationship Interconnections:\n${edgeLines.join('\n') || '- No relational pathways declared.'}`;
  
  return summary.trim();
}



function _inferSchemaTypes(nodes) {
  const types = new Set();
  for (const n of nodes) {
    if (n.type) types.add(n.type);
  }
  return Array.from(types);
}




function _parseCleanJson(text) {
  let clean = String(text || '').trim();
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Handle markdown code blocks
  if (clean.includes('```')) {
    const lines = clean.split('\n');
    const filtered = lines.filter(l => !l.trim().startsWith('```'));
    clean = filtered.join('\n').trim();
  }

  try {
    return JSON.parse(clean);
  } catch (e) {}

  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let jsonString = match[0];
  try {
    return JSON.parse(jsonString);
  } catch (initialError) {
    try {
      jsonString = jsonString
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
      return JSON.parse(jsonString);
    } catch (nestedError) {
      return null;
    }
  }
}
