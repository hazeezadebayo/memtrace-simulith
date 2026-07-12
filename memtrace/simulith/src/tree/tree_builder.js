/* ==================================================================
   simulith/src/tree/tree_builder.js
   Module 6 (Layer 4): Tree Builder / Search Engine
   Orchestrates the 4 compute layers to build the MCTS tree.
   ================================================================== */
import { encodeInitialState } from "./state_encoder.js";
import { generateOperators } from "./operator_generator.js";
import { calculateTransition } from "./transition_engine.js";
import { scoreStateUtilities } from "./utility_scorer.js";
import { computeProbabilities } from "./probability_engine.js";
import { injectPerturbations } from "./perturbation_engine.js";
import { clamp, safeStringify, toFiniteNumber, computePathEditDistance, computeCausalStateDistance, computeUtilityDistance } from "../utils/tree_runtime_utils.js";
import { getLLMCallCount } from "../../../extension/core/llm_agent.js";
import { getDomainOntology } from "../data/ontology.js";
import { getEmbedding, cosineSimilarity } from "../../../extension/llm/embedding.js";

function stateSignature(state) {
  const vars = state?.variables || {};
  const sorted = Object.keys(vars)
    .sort()
    .reduce((acc, key) => {
      acc[key] = toFiniteNumber(vars[key], 0.0);
      return acc;
    }, {});
  return safeStringify(sorted, "{}");
}

function buildChildrenMap(tree) {
  const map = new Map();
  const edgeMap = new Map();

  for (const edge of tree.edges) {
    if (!map.has(edge.from)) map.set(edge.from, []);
    map.get(edge.from).push(edge.to);
    edgeMap.set(`${edge.from}::${edge.to}`, edge);
  }

  return { childrenMap: map, edgeMap };
}

function computeBestPath(tree, rootId) {
  const nodesById = new Map(tree.nodes.map((node) => [node.id, node]));
  const { childrenMap, edgeMap } = buildChildrenMap(tree);

  function walk(nodeId, cumulativeProbability = 1.0, cumulativeScore = 0.0, path = []) {
    const node = nodesById.get(nodeId);
    if (!node) {
      return { score: cumulativeScore, path };
    }

    const nodePath = [...path, nodeId];
    const nodeUtility = clamp(toFiniteNumber(node.utility_scalar, 0.0), -1.0, 1.0);
    const nextScore = cumulativeScore + cumulativeProbability * nodeUtility;

    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      return { score: nextScore, path: nodePath };
    }

    let best = { score: -Infinity, path: nodePath };

    for (const childId of children) {
      const childNode = nodesById.get(childId);
      const edge = edgeMap.get(`${nodeId}::${childId}`);
      const childProbability = clamp(
        toFiniteNumber(edge?.probability ?? childNode?.probability ?? 0.0, 0.0),
        0.0,
        1.0
      );

      const candidate = walk(
        childId,
        cumulativeProbability * childProbability,
        nextScore,
        nodePath
      );

      if (candidate.score > best.score) {
        best = candidate;
      }
    }

    return best;
  }

  return walk(rootId);
}

function computeRiskProfile(tree) {
  const leaves = tree.nodes.filter((node) => !node.children || node.children.length === 0);
  if (leaves.length === 0) {
    return {
      variance: 0,
      tail_risk: 0,
      mean: 0,
    };
  }

  const utilities = leaves.map((node) => toFiniteNumber(node.utility_scalar, 0.0));
  const mean = utilities.reduce((acc, value) => acc + value, 0) / utilities.length;
  const variance =
    utilities.reduce((acc, value) => acc + (value - mean) ** 2, 0) / utilities.length;

  const tailCount = utilities.filter((value) => value < 0.0).length;

  return {
    mean: toFiniteNumber(mean.toFixed(4), mean),
    variance: toFiniteNumber(variance.toFixed(4), variance),
    tail_risk: toFiniteNumber((tailCount / utilities.length).toFixed(4), tailCount / utilities.length),
  };
}

export function computeStateInstability(state, ontology) {
  const vars = state?.variables || {};
  const varDefs = ontology?.variables || {};
  const interactions = ontology?.interactions || [];

  let totalInstability = 0.0;
  const keys = Object.keys(vars);
  if (keys.length === 0) return 0.0;

  const couplingWeights = {};
  for (const k of keys) {
    couplingWeights[k] = 0.0;
  }
  for (const edge of interactions) {
    if (edge.source && couplingWeights[edge.source] !== undefined) {
      couplingWeights[edge.source] += Math.abs(toFiniteNumber(edge.coefficient, 0.0));
    }
  }

  for (const k of keys) {
    const val = toFiniteNumber(vars[k], 0.5);
    const def = varDefs[k];
    const defaultVal = toFiniteNumber(def?.defaultValue, 0.5);
    const minVal = toFiniteNumber(def?.min, 0.0);
    const maxVal = toFiniteNumber(def?.max, 1.0);
    const range = Math.max(0.01, maxVal - minVal);
    
    const divergence = Math.abs(val - defaultVal) / range;
    const coupling = 1.0 + couplingWeights[k];
    
    totalInstability += divergence * coupling;
  }

  const instVal = totalInstability / keys.length;
  return clamp(instVal, 0.0, 1.0);
}

// Helper: greedy operator clustering & diversification under coverage constraint
async function clusterAndDiversifyOperators(operators, targetCount) {
  if (operators.length <= targetCount) return operators;

  const embeddings = await Promise.all(
    operators.map(async (op) => {
      try {
        const textToEmbed = typeof op === 'object' ? op.action_label || op.operator_id : String(op);
        return await getEmbedding(textToEmbed, "xenova");
      } catch (e) {
        // Fallback random embedding if service fails
        return Array.from({ length: 384 }, () => Math.random() - 0.5);
      }
    })
  );

  const clusters = [];
  for (let i = 0; i < operators.length; i++) {
    let matchedCluster = null;
    for (const cluster of clusters) {
      const repIdx = cluster[0];
      const sim = cosineSimilarity(embeddings[i], embeddings[repIdx]);
      if (sim > 0.82) {
        matchedCluster = cluster;
        break;
      }
    }
    if (matchedCluster) {
      matchedCluster.push(i);
    } else {
      clusters.push([i]);
    }
  }

  const selectedIndices = [];
  const clusterPointers = clusters.map(() => 0);
  let clusterIndex = 0;

  while (selectedIndices.length < targetCount && selectedIndices.length < operators.length) {
    const cluster = clusters[clusterIndex];
    const pointer = clusterPointers[clusterIndex];
    if (pointer < cluster.length) {
      selectedIndices.push(cluster[pointer]);
      clusterPointers[clusterIndex]++;
    }
    clusterIndex = (clusterIndex + 1) % clusters.length;

    if (clusterPointers.every((ptr, idx) => ptr >= clusters[idx].length)) {
      break;
    }
  }

  const used = new Set(selectedIndices);
  for (let i = 0; i < operators.length && selectedIndices.length < targetCount; i++) {
    if (!used.has(i)) {
      selectedIndices.push(i);
    }
  }

  return selectedIndices.map(idx => operators[idx]);
}


/**
 * Builds the full probabilistic consequence DAG.
 * This is a deterministic expansion pipeline with sampled parameterization and utility-weighted branching.
 */
export async function buildTree(
  decision,
  contextStr,
  domainName = "labor",
  maxDepth = 3,
  branchingFactor = 3,
  onProgress = null,
  ontologyOverride = null
) {
  const contextStore = typeof global !== 'undefined' && global.memtraceLlmContext ? global.memtraceLlmContext.getStore() : null;
  const signal = contextStore?.signal;
  if (signal?.aborted) {
    throw new Error('Simulation Cancelled by user.');
  }

  const safeMaxDepth = Math.max(0, Math.floor(toFiniteNumber(maxDepth, 3)));
  const safeBranchingFactor = Math.max(1, Math.floor(toFiniteNumber(branchingFactor, 3)));

  console.log(`[TreeBuilder] Starting Instability-Driven State-Space Search for: "${decision}"`);

  const ontology = ontologyOverride || getDomainOntology(domainName) || {};
  const rootState = await encodeInitialState(decision, contextStr, domainName, ontologyOverride);
  await scoreStateUtilities(rootState, domainName, ontologyOverride);

  const rootInstability = computeStateInstability(rootState, ontology);
  rootState.instability = toFiniteNumber(rootInstability.toFixed(4), rootInstability);
  rootState.path_operators = [];
  rootState.path_probability = 1.0;

  if (typeof onProgress === "function") {
    onProgress({
      nodesComputed: 1,
      llmCallCount: getLLMCallCount()
    });
  }

  const tree = {
    nodes: [rootState],
    edges: [],
  };

  const queue = [rootState];

  const operatorMemo = new Map();
  const estimationMemo = new Map();

  while (queue.length > 0) {
    if (signal?.aborted) {
      throw new Error('Simulation Cancelled by user.');
    }
    const currentNode = queue.shift();

    if (!currentNode || currentNode.depth >= safeMaxDepth) {
      continue;
    }

    const instability = computeStateInstability(currentNode, ontology);
    currentNode.instability = toFiniteNumber(instability.toFixed(4), instability);

    // Honor the user's requested branching factor directly
    const localBranching = safeBranchingFactor;

    console.log(`[TreeBuilder] Expanding Node ${currentNode.id} at Depth ${currentNode.depth} with Instability ${currentNode.instability.toFixed(4)} (Branching: ${localBranching})...`);

    const operatorSeed = currentNode.action_label || currentNode.operator || decision;
    const pathHistoryStr = (currentNode.path_operators || []).join(",");
    const operatorMemoKey = `${domainName}::${operatorSeed}::${localBranching}::${pathHistoryStr}`;

    let operators = operatorMemo.get(operatorMemoKey);
    if (!operators) {
      // Generate double the branching factor candidates to ensure cluster coverage
      const rawOperators = await generateOperators(operatorSeed, domainName, localBranching * 2, ontologyOverride, currentNode.path_operators || []);
      const perturbed = injectPerturbations(rawOperators, domainName);
      operators = await clusterAndDiversifyOperators(perturbed, localBranching);
      operatorMemo.set(operatorMemoKey, operators);
    } else {
      operators = [...operators];
    }

    const siblingCandidates = [];
    const tempEdges = [];

    for (const op of operators) {
      if (!op) continue;
      // Handle either the legacy string format or the new semantic projection object format
      const isObject = typeof op === 'object';
      const operatorName = isObject ? String(op.operator_id).trim() : String(op).trim();
      const actionLabel = isObject ? op.action_label : operatorName;
      const projectedWeights = isObject && op.projected_weights ? op.projected_weights : { [operatorName]: 1.0 };
      
      if (!operatorName) continue;

      const nextState = calculateTransition(
        currentNode,
        operatorName,
        projectedWeights,
        domainName
      );

      await scoreStateUtilities(nextState, domainName, ontologyOverride);
      
      const nextInstability = computeStateInstability(nextState, ontology);
      nextState.instability = toFiniteNumber(nextInstability.toFixed(4), nextInstability);
      nextState.path_operators = [...(currentNode.path_operators || []), operatorName];
      nextState.action_label = actionLabel;

      const edge = {
        edge_id: `E_${currentNode.id}_${nextState.id}`,
        from: currentNode.id,
        to: nextState.id,
        operator: operatorName,
        action_label: actionLabel,
        probability: 0,
        utility_scalar: nextState.utility_scalar ?? 0,
      };

      siblingCandidates.push(nextState);
      tempEdges.push(edge);
    }

    computeProbabilities(siblingCandidates);

    // Apply the Correct DAG Merge Rule
    const finalSiblings = [];

    for (let idx = 0; idx < siblingCandidates.length; idx++) {
      const child = siblingCandidates[idx];
      const edge = tempEdges[idx];

      child.path_probability = toFiniteNumber(currentNode.path_probability, 1.0) * toFiniteNumber(child.probability, 0.0);

      let mergedNode = null;
      for (const existingNode of tree.nodes) {
        if (existingNode.id === child.id) continue;
        if (existingNode.depth !== child.depth) continue;

        // Condition 1: Causal State distance (Identity check)
        const ds = computeCausalStateDistance(child.variables, existingNode.variables);
        if (ds >= 0.05) continue;

        // Condition 2: Never merge siblings (nodes generated from the exact same parent path)
        const parentPathChild = (child.path_operators || []).slice(0, -1).join(",");
        const parentPathExisting = (existingNode.path_operators || []).slice(0, -1).join(",");
        if (parentPathChild === parentPathExisting) continue;

        // Condition 3: Operator path edit distance (only merge paths that are conceptually similar)
        const pathEditDist = computePathEditDistance(child.path_operators || [], existingNode.path_operators || []);
        if (pathEditDist > 2) continue;

        // Condition 3: Stochastic compatibility
        const dMu = computeCausalStateDistance(child.expected_variables, existingNode.expected_variables);
        if (dMu >= 0.05) continue;

        mergedNode = existingNode;
        break;
      }

      if (mergedNode) {
        console.log(`[DAG Merge] Merging node ${child.id} into existing node ${mergedNode.id} at depth ${child.depth}`);
        child.mergedTo = mergedNode.id;

        const w_i = toFiniteNumber(mergedNode.path_probability, 0.0);
        const w_j = toFiniteNumber(child.path_probability, 0.0);
        const sumW = w_i + w_j;
        const newW = Math.max(0.0001, sumW);

        // Post-merge utility check for collision risk
        const dU = computeUtilityDistance(child.utilities, mergedNode.utilities);
        if (dU > 0.20) {
          mergedNode.semantic_collision_risk = true;
        }

        // Average variables
        for (const k of Object.keys(mergedNode.variables || {})) {
          const vI = toFiniteNumber(mergedNode.variables[k], 0.0);
          const vJ = toFiniteNumber(child.variables[k], 0.0);
          mergedNode.variables[k] = toFiniteNumber(((w_i * vI + w_j * vJ) / newW).toFixed(4), (w_i * vI + w_j * vJ) / newW);
        }

        // Average expected_variables
        for (const k of Object.keys(mergedNode.expected_variables || {})) {
          const vI = toFiniteNumber(mergedNode.expected_variables[k], 0.0);
          const vJ = toFiniteNumber(child.expected_variables[k], 0.0);
          mergedNode.expected_variables[k] = toFiniteNumber(((w_i * vI + w_j * vJ) / newW).toFixed(4), (w_i * vI + w_j * vJ) / newW);
        }

        // Average utilities
        for (const k of Object.keys(mergedNode.utilities || {})) {
          const uI = toFiniteNumber(mergedNode.utilities[k], 0.0);
          const uJ = toFiniteNumber(child.utilities[k], 0.0);
          mergedNode.utilities[k] = toFiniteNumber(((w_i * uI + w_j * uJ) / newW).toFixed(4), (w_i * uI + w_j * uJ) / newW);
        }

        // Average utility scalar
        const usI = toFiniteNumber(mergedNode.utility_scalar, 0.0);
        const usJ = toFiniteNumber(child.utility_scalar, 0.0);
        mergedNode.utility_scalar = toFiniteNumber(((w_i * usI + w_j * usJ) / newW).toFixed(4), (w_i * usI + w_j * usJ) / newW);

        mergedNode.path_probability = sumW;

        // Redirect edge
        edge.to = mergedNode.id;
        edge.edge_id = `E_${currentNode.id}_${mergedNode.id}`;
        edge.probability = child.probability;
        edge.utility_scalar = mergedNode.utility_scalar;

        tree.edges.push(edge);
      } else {
        tree.nodes.push(child);
        edge.probability = child.probability;
        edge.utility_scalar = child.utility_scalar;
        tree.edges.push(edge);
        finalSiblings.push(child);
      }

      if (typeof onProgress === "function") {
        onProgress({
          nodesComputed: tree.nodes.length,
          llmCallCount: getLLMCallCount()
        });
      }
    }

    currentNode.children = siblingCandidates.map((s) => s.mergedTo || s.id);
    currentNode.child_probabilities = siblingCandidates.map((s) => s.probability);

    for (const child of finalSiblings) {
      const pruningThreshold = 0.001; // Allow user's requested branches to survive instead of aggressive pruning
      if (child.probability >= pruningThreshold && child.depth < safeMaxDepth) {
        queue.push(child);
      } else if (child.depth < safeMaxDepth) {
        console.log(`[Pruning] Node ${child.id} pruned (Prob: ${child.probability} < ${pruningThreshold})`);
      }
    }
  }

  const best = computeBestPath(tree, rootState.id);
  const riskProfile = computeRiskProfile(tree);

  console.log(`[TreeBuilder] DAG search complete. Total Nodes: ${tree.nodes.length}`);

  return {
    root_state: rootState,
    tree,
    domain: domainName,
    summary: {
      best_path: best.path,
      highest_expected_utility: toFiniteNumber(best.score.toFixed(4), best.score),
      risk_profile: riskProfile,
      node_count: tree.nodes.length,
      edge_count: tree.edges.length,
    },
  };
}