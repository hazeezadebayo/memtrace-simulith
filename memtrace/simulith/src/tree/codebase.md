examine, understand and digest the below context:











simulith/src/tree/elasticity.js:

```
import { clamp, toFiniteNumber } from "../utils/tree_runtime_utils.js";

/**
 * Computes the actual delta for a state variable given elasticity model.
 *
 * @param {number} currentValue  - Current S_t value of the variable (in [min, max])
 * @param {number} magnitude     - Raw causal delta from ontology (can be negative)
 * @param {string} elasticityModel - "flat" | "inverse" | "proportional"
 * @param {number} min           - Variable's minimum bound (default 0.0)
 * @param {number} max           - Variable's maximum bound (default 1.0)
 * @returns {number}             - The actual delta to apply
 */

/**
 * Compute the context-sensitive delta produced by an operator.
 *
 * This function is intentionally deterministic.
 * It does not call an LLM and does not sample randomness.
 */
export function computeElasticDelta(
    currentValue,
    magnitude,
    elasticityModel,
    min = 0.0,
    max = 1.0
) {
    const lo = toFiniteNumber(min, 0.0);
    const hi = toFiniteNumber(max, 1.0);
    const current = clamp(currentValue, lo, hi);

    const range = hi - lo;
    if (range <= 0) return 0;

    const magnitudeValue = toFiniteNumber(magnitude, 0);

    // Normalise current value to [0, 1] within its own range.
    const normalised = clamp((current - lo) / range, 0, 1);

    let delta = magnitudeValue;

    switch (elasticityModel) {
        case "flat":
            // No context sensitivity.
            delta = magnitudeValue;
            break;

        case "inverse": {
            // Strongest when the push goes against the current position.
            // Negative magnitude is strongest when the variable is already high.
            // Positive magnitude is strongest when the variable is already low.
            const headroom = magnitudeValue < 0 ? normalised : 1 - normalised;
            const multiplier = 0.15 + 1.35 * headroom;
            delta = magnitudeValue * multiplier;
            break;
        }

        case "proportional": {
            // Scales with the current variable level.
            const multiplier = 0.2 + 1.6 * normalised;
            delta = magnitudeValue * multiplier;
            break;
        }

        default:
            // Unknown model falls back to flat.
            delta = magnitudeValue;
            break;
    }

    // Make sure the delta cannot push past the hard bounds.
    const minDelta = lo - current;
    const maxDelta = hi - current;
    delta = clamp(delta, minDelta, maxDelta);

    return delta;
}
```















---

simulith/src/tree/estimation_engine.js:

```
import { callLLM as rawCallLLM } from "../llm/ai.js";
import { getDomainOntology } from "../data/ontology.js";
import { SHOCK_REGISTRY } from "../data/shocks.js";
import {
  clamp,
  isPlainObject,
  normalizeOperatorDefinitions,
  parseJsonObjectFromText,
  safeStringify,
  toFiniteNumber,
} from "../utils/tree_runtime_utils.js";

const callLLM = typeof rawCallLLM === "function" ? rawCallLLM : async () => "";

function findShockById(shockId) {
  if (!shockId) return null;
  const targetId = String(shockId).trim().toUpperCase();
  for (const domainKey of Object.keys(SHOCK_REGISTRY)) {
    const domainShocks = SHOCK_REGISTRY[domainKey];
    if (domainShocks) {
      const posMatch = (domainShocks.positive || []).find(s => String(s.id).toUpperCase() === targetId);
      if (posMatch) return posMatch;
      const negMatch = (domainShocks.negative || []).find(s => String(s.id).toUpperCase() === targetId);
      if (negMatch) return negMatch;
    }
  }
  return null;
}

import { getEmbedding, cosineSimilarity } from "../../../extension/llm/embedding.js";

const dynamicEstimationsCache = [];

/**
 * For variables impacted by an operator but lacking hardcoded base effects,
 * ask the LLM for a bounded statistical estimate: { mean, variance }.
 */
export async function estimateDynamicParameters(operatorName, currentState, domainName) {
  const ontology = getDomainOntology(domainName) || {};
  const operatorDefs = normalizeOperatorDefinitions(ontology.operators || {});
  let opDef = operatorDefs[operatorName];

  if (!opDef) {
    const shock = findShockById(operatorName);
    opDef = {
      description: shock?.description || operatorName,
      dynamic_effects: Object.keys(ontology.variables || {}),
    };
  }

  if (!opDef || !Array.isArray(opDef.dynamic_effects) || opDef.dynamic_effects.length === 0) {
    return {};
  }

  const contextKey = `${domainName}::${[...opDef.dynamic_effects].sort().join(",")}`;
  const opDescription = opDef.description || operatorName;

  let opEmbedding = null;
  try {
    opEmbedding = await getEmbedding(opDescription, "xenova");
  } catch (e) {
    console.warn("[EstimationCache] Embedding failed, bypassing cache:", e.message);
  }

  if (opEmbedding) {
    const cachedEntry = dynamicEstimationsCache.find(entry => {
      if (entry.contextKey !== contextKey) return false;
      const sim = cosineSimilarity(entry.embedding, opEmbedding);
      return sim > 0.88;
    });
    if (cachedEntry) {
      console.log(`[EstimationCache] 🎯 Cache hit for operator: "${operatorName}" (Sim: ${cachedEntry.operatorName})`);
      return cachedEntry.distributions;
    }
  }

  const prompt = `You are a Statistical Parameter Estimator.

A mathematical state transition is occurring. We know the deterministic base effects,
but need bounded statistical estimates for dynamic variables.

CURRENT STATE:
${safeStringify(currentState?.variables || {}, "{}")}

OPERATOR APPLIED:
${JSON.stringify(String(operatorName ?? ""))}
${opDef.description ? `OPERATOR DESCRIPTION:\n${opDef.description}\n` : ""}
VARIABLES REQUIRING ESTIMATION:
${safeStringify(opDef.dynamic_effects, "[]")}

Return ONLY valid JSON.
For each variable, output:
{
  "variable_name": { "mean": <float between -1.0 and 1.0>, "variance": <float between 0.0 and 0.5> }
}

Do not explain anything.
Example:
{"productivity":{"mean":-0.15,"variance":0.05}}`;

  const rawOutput = await callLLM(prompt, 0.3);

  const parsed = parseJsonObjectFromText(rawOutput, {});
  const distributions = {};
  const parsedKeys = Object.keys(parsed);

  for (const key of opDef.dynamic_effects) {
    let candidate = parsed[key];
    if (candidate === undefined) {
      const clean = (str) => String(str).toLowerCase().replace(/[\s_-]/g, "");
      const target = clean(key);
      const foundKey = parsedKeys.find(k => clean(k) === target);
      if (foundKey !== undefined) {
        candidate = parsed[foundKey];
      }
    }

    if (typeof candidate === "number") {
      distributions[key] = {
        mean: clamp(candidate, -1.0, 1.0),
        variance: 0.1,
      };
      continue;
    }

    if (isPlainObject(candidate)) {
      const mean = clamp(toFiniteNumber(candidate.mean, 0.0), -1.0, 1.0);
      const variance = clamp(toFiniteNumber(candidate.variance, 0.1), 0.0, 0.5);

      distributions[key] = { mean, variance };
      continue;
    }

    distributions[key] = { mean: 0.0, variance: 0.1 };
  }

  if (opEmbedding) {
    dynamicEstimationsCache.push({
      contextKey,
      operatorName,
      embedding: opEmbedding,
      distributions
    });
  }

  return distributions;
}

export function clearDynamicEstimationsCache() {
  dynamicEstimationsCache.length = 0;
}
```












---

simulith/src/tree/operator_generator.js:

```
import { callLLM as rawCallLLM } from "../llm/ai.js";
import { getDomainOntology } from "../data/ontology.js";
import {
  normalizeOperatorDefinitions,
  parseJsonArrayFromText,
  safeStringify,
} from "../utils/tree_runtime_utils.js";

const callLLM = typeof rawCallLLM === "function" ? rawCallLLM : async () => "";

/**
 * Generates an array of operator IDs that are valid for the current domain ontology.
 * The LLM may rank/select only from the allowed operator set.
 */
export async function generateOperators(decision, domainName, branchingFactor = 3, ontologyOverride = null, pathHistory = []) {
  const safeBranchingFactor = Math.max(1, Math.floor(Number(branchingFactor) || 3));
  const ontology = ontologyOverride || getDomainOntology(domainName) || {};
  const operatorDefs = normalizeOperatorDefinitions(ontology.operators || {});
  const allowedOperatorNames = Object.keys(operatorDefs);

  if (allowedOperatorNames.length === 0) {
    return [];
  }

  const operatorCatalog = allowedOperatorNames.map((name) => {
    const def = operatorDefs[name];
    return {
      operator_id: name,
      description: def.description || "",
      base_effect_variables: Object.keys(def.base_effects || {}),
      dynamic_effects: def.dynamic_effects || [],
      tags: def.tags || [],
    };
  });

  const pathHistoryStr = pathHistory.length > 0 ? JSON.stringify(pathHistory) : "None (Root node)";

const prompt = `You are the Creative Strategist for a state-space engine.

Based on the USER DECISION and current state, generate exactly ${safeBranchingFactor} distinct, highly contextual actions that the user could take right now.

USER DECISION: ${JSON.stringify(String(decision ?? ""))}
PATH HISTORY (Prior actions taken in this timeline): ${pathHistoryStr}

CRITICAL INSTRUCTIONS:
1. Generate highly specific, human-readable phrases describing the action (e.g., "Promote internal lead", "Launch a hostile takeover", "Pause development to fix tech debt").
2. DO NOT return actions that are conceptually identical to actions in the PATH HISTORY.
3. Be creative but realistic.

Return ONLY a JSON array of strings representing the action labels.
Do not output any objects or IDs.

Example:
[
  "Pause development to fix tech debt",
  "Launch an aggressive marketing campaign",
  "Fire the underperforming executive"
]`;

  let rawOutput = "[]";
  try {
    rawOutput = await callLLM(prompt, 0.5);
  } catch(e) {
    console.warn("LLM operator generation failed", e);
  }

  const parsedLabels = parseJsonArrayFromText(rawOutput, []);
  
  // Extract only strings
  let actionLabels = parsedLabels.filter(label => typeof label === "string" && label.trim().length > 0);

  // Fallback if LLM fails
  if (actionLabels.length < safeBranchingFactor) {
     actionLabels = allowedOperatorNames.slice(0, safeBranchingFactor).map(name => ontology.operator_labels?.[name] || name);
  }

  actionLabels = actionLabels.slice(0, safeBranchingFactor);

  // Semantic Projection: Map labels to base ontology operator weights
  const validOperators = [];
  
  const { getEmbedding, cosineSimilarity } = await import("../../../extension/llm/embedding.js");

  // Pre-compute ontology operator embeddings
  const ontologyEmbeddings = {};
  for (const opName of allowedOperatorNames) {
    const desc = operatorDefs[opName].description || opName;
    try {
      ontologyEmbeddings[opName] = await getEmbedding(desc, "xenova");
    } catch(e) {
      ontologyEmbeddings[opName] = null;
    }
  }

  for (const label of actionLabels) {
    let labelEmbedding = null;
    try {
      labelEmbedding = await getEmbedding(label, "xenova");
    } catch(e) {}

    let projectedWeights = {};
    if (labelEmbedding) {
      const similarities = [];
      for (const opName of allowedOperatorNames) {
         if (ontologyEmbeddings[opName]) {
            const sim = cosineSimilarity(labelEmbedding, ontologyEmbeddings[opName]);
            // Only consider positive similarities above a threshold to avoid noise
            if (sim > 0.1) {
               similarities.push({ opName, sim });
            }
         }
      }
      
      if (similarities.length > 0) {
        // Softmax the similarities to get distribution
        const maxSim = Math.max(...similarities.map(s => s.sim));
        let expSum = 0;
        const exps = similarities.map(s => {
           const val = Math.exp((s.sim - maxSim) * 5.0); // Temperature scaling to sharpen
           expSum += val;
           return { opName: s.opName, val };
        });
        
        for (const item of exps) {
           projectedWeights[item.opName] = item.val / expSum;
        }
      } else {
        // Fallback to random if no match
        projectedWeights[allowedOperatorNames[0]] = 1.0;
      }
    } else {
      projectedWeights[allowedOperatorNames[0]] = 1.0;
    }

    validOperators.push({
      operator_id: label, // We use the label as the unique ID for the tree node
      action_label: label,
      projected_weights: projectedWeights
    });
  }

  return validOperators;
}
```













---

simulith/src/tree/perturbation_engine.js:

```
import { getRandomShock } from "../data/shocks.js";

/**
 * Probabilistically injects a wildcard shock operator into the operator list.
 * The output remains an array of operator IDs so the physics layer can execute it.
 */
export function injectPerturbations(operators, domainName = "COMMON") {
    const result = Array.isArray(operators) ? [...operators] : [];
    const threshold = 0.85; // 15% chance of a shock event.

    const roll = Math.random();
    if (roll <= threshold) {
        return result;
    }

    const shockData = getRandomShock({ domain: domainName });

    if (!shockData || typeof shockData.id !== "string" || !shockData.id.trim()) {
        console.warn("[PerturbationEngine] Shock registry returned no executable id.");
        return result;
    }

    const shockOperator = shockData.id.trim();
    const shockObj = { operator_id: shockOperator, action_label: shockData.title || shockOperator };

    if (result.length > 0) {
        result[result.length - 1] = shockObj;
    } else {
        result.push(shockObj);
    }

    console.log(
        `[PerturbationEngine] ⚡ SHOCK INJECTED: ${shockData.id ?? shockOperator} - ${shockData.title ?? shockOperator}`
    );

    return result;
}
```












---

simulith/src/tree/probability_engine.js:

```
import { clamp, toFiniteNumber } from "../utils/tree_runtime_utils.js";

function computeNodeUtilityScalar(node) {
  if (Number.isFinite(node?.utility_scalar)) {
    return toFiniteNumber(node.utility_scalar, 0.0);
  }

  const utilities = node?.utilities || node?.stakeholder_utilities || {};
  const values = Object.values(utilities).map((v) => toFiniteNumber(v, 0.0));
  if (values.length === 0) return 0.0;

  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/**
 * Converts sibling utilities into a probability distribution using relative pairwise regret and softmax.
 * Sibling nodes minimize regret to gain higher probabilities under competitive pressure.
 */
export function computeProbabilities(siblingNodes, options = {}) {
  if (!Array.isArray(siblingNodes) || siblingNodes.length === 0) return siblingNodes;

  const temperature = Math.max(0.0001, toFiniteNumber(options.temperature, 1.0));
  
  // Calculate relative regret for each sibling node across all stakeholders
  const regrets = siblingNodes.map((node, idx) => {
    let totalRegret = 0.0;
    const keys = Object.keys(node.utilities || {});
    if (keys.length === 0) return 0.0;

    for (let otherIdx = 0; otherIdx < siblingNodes.length; otherIdx++) {
      if (idx === otherIdx) continue;
      const other = siblingNodes[otherIdx];
      for (const key of keys) {
        const vSelf = toFiniteNumber(node.utilities?.[key], 0.0);
        const vOther = toFiniteNumber(other.utilities?.[key], 0.0);
        totalRegret += Math.max(0, vOther - vSelf);
      }
    }
    return totalRegret;
  });

  // Logits are negative regrets (minimizing regret maximizes probability)
  const scores = regrets.map(r => -r);

  const effectiveTemp = temperature * 1.5; // Relaxed temperature to ensure smoother distribution and avoid pruning
  const maxScore = Math.max(...scores.map((s) => s / effectiveTemp));
  const expScores = scores.map((s) => Math.exp(s / effectiveTemp - maxScore));
  const sumExp = expScores.reduce((acc, value) => acc + value, 0);

  // Still compute raw utility scalars for telemetry display/ranking
  const rawUtilityScalars = siblingNodes.map(node => computeNodeUtilityScalar(node));

  if (!Number.isFinite(sumExp) || sumExp <= 0) {
    const uniform = 1 / siblingNodes.length;
    siblingNodes.forEach((node, index) => {
      node.probability = index === siblingNodes.length - 1 ? 1 - uniform * (siblingNodes.length - 1) : uniform;
      node.utility_scalar = clamp(rawUtilityScalars[index], -1.0, 1.0);
      node.expected_utility = node.utility_scalar * node.probability;
      node.regret = regrets[index];
    });
    return siblingNodes;
  }

  siblingNodes.forEach((node, index) => {
    const p = expScores[index] / sumExp;
    node.probability = clamp(toFiniteNumber(p, 0.0), 0.0, 1.0);
    node.probability = toFiniteNumber(node.probability.toFixed(4), node.probability);
    node.utility_scalar = clamp(rawUtilityScalars[index], -1.0, 1.0);
    node.expected_utility = node.utility_scalar * node.probability;
    node.regret = regrets[index];
  });

  // Floating-point correction so siblings sum exactly to 1.0.
  let total = siblingNodes.reduce((acc, node) => acc + toFiniteNumber(node.probability, 0.0), 0.0);
  const diff = toFiniteNumber((1.0 - total).toFixed(4), 0.0);

  if (Math.abs(diff) > 0 && siblingNodes.length > 0) {
    siblingNodes[siblingNodes.length - 1].probability = toFiniteNumber(
      clamp(siblingNodes[siblingNodes.length - 1].probability + diff, 0.0, 1.0).toFixed(4),
      siblingNodes[siblingNodes.length - 1].probability
    );
  }

  return siblingNodes;
}
```











---

simulith/src/tree/query_adapter.js:

```
import { callLLM as rawCallLLM } from "../llm/ai.js";
import { getEmbedding, cosineSimilarity } from "../../../extension/llm/embedding.js";
import {
  parseJsonObjectFromText,
  parseJsonArrayFromText,
  safeStringify,
  clamp,
  toFiniteNumber,
} from "../utils/tree_runtime_utils.js";

const callLLM = typeof rawCallLLM === "function" ? rawCallLLM : async () => "";

// ── Ontology helpers ─────────────────────────────────────────────────

/**
 * Merges LLM-generated additions on top of the base ontology.
 * The base ontology always wins on key collisions for variables and operators
 * so the deterministic engine stays stable. Stakeholders and interactions
 * are simply unioned.
 */
function mergeOntologies(base, additions) {
  if (!additions || typeof additions !== "object") return base;

  const merged = {
    domain_name: base.domain_name,
    variables: { ...(additions.variables || {}), ...(base.variables || {}) },
    operators: { ...(additions.operators || {}), ...(base.operators || {}) },
    interactions: [
      ...(base.interactions || []),
      ...(additions.interactions || []),
    ],
    stakeholders: [
      ...(base.stakeholders || []),
      ...(additions.stakeholders || []),
    ],
    // Carry through human-readable labels for the UI layer
    variable_labels: additions.variable_labels || {},
    operator_labels: additions.operator_labels || {},
    stakeholder_labels: additions.stakeholder_labels || {},
    decision_summary: additions.decision_summary || "",
  };

  // De-duplicate stakeholders by id/label
  const seenStakeholders = new Set();
  merged.stakeholders = merged.stakeholders.filter((s) => {
    const key = s.id || s.label || String(s);
    if (seenStakeholders.has(key)) return false;
    seenStakeholders.add(key);
    return true;
  });

  return merged;
}

export async function generateDecisionSpace(decision, context, baseOntology) {
  const existingVarNames = Object.keys(baseOntology.variables || {});
  const existingOpNames  = Object.keys(baseOntology.operators  || {});
  const existingStakeholders = (baseOntology.stakeholders || []).map(
    (s) => s.id || s.label || String(s)
  );

  const prompt = `You are the Decision Space Adapter for a causal simulation engine.

Your job has two parts:

PART A — Human Labels
Map every existing variable, operator, and stakeholder ID to a short, plain-English
human-readable label (3-6 words max). Users are not engineers. No snake_case. No jargon.

PART B — Query-Specific Additions (Optional)
If the user decision has important factors that are NOT captured by the existing variables/operators/stakeholders,
add up to 3 new variables, 3 new operators, and 2 new stakeholders.
Each new variable must have: min (0), max (1), defaultValue (0-1), and a plain description.
Each new operator must have: description (plain English), base_effects (object mapping variable names to {magnitude, elasticity}), dynamic_effects (array of variable names).
New operator base_effects MUST only reference variables that exist in the existing OR new variable lists.

USER DECISION:
${JSON.stringify(String(decision ?? ""))}

CONTEXT:
${JSON.stringify(String(context ?? ""))}

EXISTING VARIABLES:
${safeStringify(existingVarNames, "[]")}

EXISTING OPERATORS:
${safeStringify(existingOpNames, "[]")}

EXISTING STAKEHOLDERS:
${safeStringify(existingStakeholders, "[]")}

Return ONLY valid JSON with this exact structure:
{
  "decision_summary": "one sentence describing the decision in plain English",
  "variable_labels": {
    "existing_var_id": "Human Readable Label",
    ...
  },
  "operator_labels": {
    "existing_op_id": "Human Readable Description",
    ...
  },
  "stakeholder_labels": {
    "existing_stakeholder_id": "Human Readable Name",
    ...
  },
  "variables": {
    "new_var_id": { "min": 0, "max": 1, "defaultValue": 0.5, "description": "..." }
  },
  "operators": {
    "new_op_id": { "description": "...", "base_effects": {}, "dynamic_effects": [] }
  },
  "stakeholders": [],
  "interactions": []
}

If no additions are needed, leave "variables", "operators", "stakeholders", "interactions" as empty objects/arrays.`;

  let raw = "{}";
  try {
    raw = await callLLM(prompt, 0.3);
  } catch (e) {
    console.warn("[QueryAdapter] generateDecisionSpace LLM call failed:", e.message);
  }

  const additions = parseJsonObjectFromText(raw, {});

  // Clamp any new variable defaultValues to [0, 1]
  if (additions.variables && typeof additions.variables === "object") {
    for (const [key, def] of Object.entries(additions.variables)) {
      if (typeof def === "object" && def !== null) {
        def.min = toFiniteNumber(def.min, 0.0);
        def.max = toFiniteNumber(def.max, 1.0);
        def.defaultValue = clamp(toFiniteNumber(def.defaultValue, 0.5), def.min, def.max);
      }
    }
  }

  return mergeOntologies(baseOntology, additions);
}

// ── Dominant Futures extraction ──────────────────────────────────────

export function extractDominantPaths(tree, rootId, topN = 3) {
  const nodesById = new Map((tree.nodes || []).map((n) => [n.id, n]));
  const edgesByFrom = new Map();
  for (const edge of (tree.edges || [])) {
    if (!edgesByFrom.has(edge.from)) edgesByFrom.set(edge.from, []);
    edgesByFrom.get(edge.from).push(edge);
  }

  // DFS to collect all root-to-leaf paths
  const allPaths = [];

  function dfs(nodeId, pathOps, cumulativeProb, accumulatedExpectedUtility) {
    const node = nodesById.get(nodeId);
    if (!node) return;

    const nodeUtility = toFiniteNumber(node.utility_scalar, 0);
    const currentExpectedUtility = accumulatedExpectedUtility + cumulativeProb * nodeUtility;

    const outEdges = edgesByFrom.get(nodeId) || [];
    if (outEdges.length === 0) {
      // Leaf node
      allPaths.push({
        operators: [...pathOps],
        cumulativeProb,
        terminalUtility: nodeUtility,
        terminalNode: node,
        score: currentExpectedUtility,
      });
      return;
    }

    for (const edge of outEdges) {
      const childProb = clamp(toFiniteNumber(edge.probability, 0), 0, 1);
      dfs(
        edge.to,
        [...pathOps, { operator: edge.operator, probability: childProb }],
        cumulativeProb * childProb,
        currentExpectedUtility
      );
    }
  }

  dfs(rootId, [], 1.0, 0.0);

  // Sort by expected utility score first to find the most impactful paths
  allPaths.sort((a, b) => b.score - a.score);
  let topPaths = allPaths.slice(0, topN);

  // Normalize probabilities relative to the dominant set so they don't appear artificially low
  const sumProb = topPaths.reduce((sum, p) => sum + p.cumulativeProb, 0.0);
  if (sumProb > 0) {
    topPaths.forEach(p => {
      p.cumulativeProb = p.cumulativeProb / sumProb;
    });
  }

  // Finally, sort the displayed futures by likelihood (probability descending)
  topPaths.sort((a, b) => b.cumulativeProb - a.cumulativeProb);

  return topPaths;
}

// ── Phase 2 — Narrative Translation ─────────────────────────────────

export async function explainDominantFutures(decision, dominantPaths, decisionSpace) {
  if (!dominantPaths || dominantPaths.length === 0) {
    return [];
  }

  const variableLabels = decisionSpace.variable_labels || {};
  const operatorLabels = decisionSpace.operator_labels || {};
  const stakeholderLabels = decisionSpace.stakeholder_labels || {};

  // Build a minimal, human-readable path descriptor for each dominant future
  const pathDescriptors = dominantPaths.map((path, i) => {
    const probPercent = Math.round(path.cumulativeProb * 100);
    const utilityScore = toFiniteNumber(path.terminalUtility, 0);

    // Translate operator IDs to human labels
    const steps = path.operators.map((op) => ({
      action: operatorLabels[op.operator] || op.operator.replace(/_/g, " "),
      probability: Math.round((op.probability || 0) * 100),
    }));

    // Translate terminal node variables to human-readable format
    const termVars = path.terminalNode?.variables || {};
    const keyChanges = Object.entries(termVars)
      .map(([k, v]) => ({
        label: variableLabels[k] || k.replace(/_/g, " "),
        value: toFiniteNumber(v, 0),
      }))
      .sort((a, b) => Math.abs(b.value - 0.5) - Math.abs(a.value - 0.5))
      .slice(0, 4); // Top 4 most-deviated variables

    // Translate stakeholder utilities
    const stakeholderImpacts = Object.entries(path.terminalNode?.utilities || {})
      .map(([k, v]) => ({
        name: stakeholderLabels[k] || k,
        impact: toFiniteNumber(v, 0),
      }));

    return {
      index: i + 1,
      probability_percent: probPercent,
      utility_score: utilityScore,
      causal_steps: steps,
      key_variable_states: keyChanges,
      stakeholder_impacts: stakeholderImpacts,
    };
  });

  const prompt = `You are the Decision Interpreter for a causal forecasting system.

A user asked: ${JSON.stringify(String(decision ?? ""))}

The simulation has computed ${pathDescriptors.length} dominant futures.
For each, translate the mathematical result into a plain-English card that a person
with no technical background can immediately understand and act on.

COMPUTED FUTURES:
${safeStringify(pathDescriptors, "[]")}

Return a JSON array of objects, one for each future.
Each object must have exactly these keys:
- title: A highly distinct and specific 5-8 word headline that highlights the unique final step or differentiating theme of this future (e.g. "Workshop Focus Drives Feature Clarity"). Do NOT repeat titles or use generic names like "Future 1".
- probability_label: e.g. "Very Likely (78%)" or "Possible (34%)"
- outcome: 2-3 sentences in plain, direct language describing what this future looks like for the user
- main_risk: One specific sentence naming the biggest danger in this path
- main_upside: One specific sentence naming the best opportunity in this path
- signal: One observable thing the user can watch to know this future is unfolding
- action: One concrete thing the user could do RIGHT NOW to navigate this future
- sentiment: "positive", "negative", or "neutral"

Example JSON output:
[
  {
    "title": "Workshop Focus Drives Feature Clarity",
    "probability_label": "Very Likely (40%)",
    "outcome": "By prioritizing features through a structured workshop, you will align your team and finalize the first feature within two weeks.",
    "main_risk": "Core team disagreement may slow or derail feature development.",
    "main_upside": "A focused workshop and framework will keep your team aligned.",
    "signal": "First feature finalized within 2 weeks.",
    "action": "Schedule the workshop today.",
    "sentiment": "positive"
  }
]

Return ONLY the valid JSON array. Do not wrap in markdown blocks other than \`\`\`json.`;

  let raw = "[]";
  try {
    raw = (await callLLM(prompt, 0.4)) || "[]";
  } catch (e) {
    console.warn("[QueryAdapter] explainDominantFutures LLM call failed:", e.message);
  }

  const normalizeKeysToLowercase = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeKeysToLowercase);
    const normalized = {};
    for (const [key, val] of Object.entries(obj)) {
      const cleanKey = key.trim().replace(/[-\s]+/g, '_').toLowerCase();
      normalized[cleanKey] = typeof val === 'object' ? normalizeKeysToLowercase(val) : val;
    }
    return normalized;
  };

  let narratives = [];

  // Parse custom line-based format (as fallback for older/local models that output text)
  const blocks = raw.split(/(?:\[\s*FUTURE\s*\d+\s*\]|\bFUTURE\s*\d+\b[:\-\s]*|###\s*FUTURE\s*\d+|\*\*FUTURE\s*\d+\*\*)/i).filter(b => b.trim().length > 0);
  
  for (const block of blocks) {
    const narrative = {};
    const lines = block.split('\n');
    let currentKey = null;
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      const match = line.match(/^\s*[-*#\s]*\**([A-Z_-\s]+)\**:\s*(.*)$/i);
      if (match) {
        currentKey = match[1].trim().replace(/[-\s]+/g, '_').toLowerCase();
        // Remove enclosing quotes if the LLM hallucinated them
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        narrative[currentKey] = val;
      } else if (currentKey) {
        // Append to current key if it spans multiple lines
        narrative[currentKey] += " " + line;
      }
    }
    
    if (Object.keys(narrative).length > 0) {
      narratives.push(narrative);
    }
  }

  // Fallback for LLMs that output JSON
  if (narratives.length === 0 || narratives.length < dominantPaths.length) {
    narratives = parseJsonArrayFromText(raw, []);
    
    if (narratives.length === 0) {
      const parsedObj = parseJsonObjectFromText(raw, null);
      if (parsedObj && typeof parsedObj === 'object') {
        for (const val of Object.values(parsedObj)) {
          if (Array.isArray(val) && val.length > 0) {
            narratives = val;
            break;
          }
        }
      }
    }

    if (narratives.length === 0) {
      const extracted = [];
      let searchStr = raw;
      while (searchStr.indexOf('{') !== -1) {
        const startIndex = searchStr.indexOf('{');
        let depth = 0;
        let endIndex = -1;
        let inString = false;
        let escaped = false;
        
        for (let i = startIndex; i < searchStr.length; i++) {
          const ch = searchStr[i];
          if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
          }
          if (ch === '"') inString = true;
          else if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
        
        if (endIndex !== -1) {
          const block = searchStr.slice(startIndex, endIndex + 1);
          try {
            const parsed = JSON.parse(block);
            if (parsed && typeof parsed === 'object') {
              extracted.push(parsed);
            }
          } catch(e) {}
          searchStr = searchStr.slice(endIndex + 1);
        } else {
          break; // Unbalanced
        }
      }
      
      if (extracted.length > 0) {
        narratives = extracted;
      }
    }
  }

  const normalizedNarratives = normalizeKeysToLowercase(narratives);

  // Dynamic mathematically-grounded fallback generator
  const generateFallbackNarrative = (path, idx) => {
    const steps = (path.operators || []).map((op) => {
      const label = operatorLabels[op.operator] || op.operator.replace(/_/g, " ");
      const prob = Math.round((op.probability || 0) * 100);
      return { label, prob };
    });

    const impacts = Object.entries(path.terminalNode?.utilities || {})
      .map(([k, v]) => ({
        name: stakeholderLabels[k] || k.replace(/_/g, " "),
        impact: toFiniteNumber(v, 0),
      }))
      .sort((a, b) => b.impact - a.impact);

    const positiveImpacts = impacts.filter(imp => imp.impact > 0.05);
    const negativeImpacts = impacts.filter(imp => imp.impact < -0.05).reverse();

    const termVars = path.terminalNode?.variables || {};
    const keyChanges = Object.entries(termVars)
      .map(([k, v]) => ({
        label: variableLabels[k] || k.replace(/_/g, " "),
        value: toFiniteNumber(v, 0),
      }))
      .sort((a, b) => Math.abs(b.value - 0.5) - Math.abs(a.value - 0.5))
      .slice(0, 4);

    let title = `Future ${idx + 1}`;
    if (steps.length > 0) {
      const firstStep = steps[0].label;
      const prefix = path.terminalUtility > 0.2 ? "Progressive Path" : (path.terminalUtility < -0.2 ? "Risk Exposure" : "Stabilization");
      if (steps.length > 1) {
        const lastStep = steps[steps.length - 1].label;
        title = `${prefix} via ${firstStep} to ${lastStep}`;
      } else {
        title = `${prefix} via ${firstStep}`;
      }
    }
    if (title.length > 150) {
      title = title.substring(0, 147) + "...";
    }

    const probPercent = Math.round(path.cumulativeProb * 100);
    let probLabel = "Possible";
    if (probPercent >= 75) probLabel = "Very Likely";
    else if (probPercent >= 45) probLabel = "Likely";
    else if (probPercent >= 20) probLabel = "Possible";
    else probLabel = "Unlikely";
    probLabel += ` (${probPercent}%)`;

    let outcome = "";
    if (steps.length > 0) {
      outcome = `Initiating with ${steps[0].label} (${steps[0].prob}% probability)`;
      if (steps.length > 1) {
        outcome += ` leads to ${steps.slice(1).map(s => s.label).join(", then ")}`;
      }
      outcome += `.`;
    } else {
      outcome = `Maintains current baseline states.`;
    }

    if (keyChanges.length > 0) {
      const changes = keyChanges.slice(0, 2).map(c => {
        const direction = c.value > 0.5 ? "increases" : "decreases";
        const intensity = Math.abs(c.value - 0.5) > 0.25 ? "significantly" : "moderately";
        return `${c.label} ${intensity} ${direction}`;
      });
      outcome += ` This sequence ensures that ${changes.join(" while ")}.`;
    }

    let mainUpside = "Opportunity to establish structural baseline stability.";
    if (positiveImpacts.length > 0) {
      mainUpside = `Positive reinforcement of +${Math.round(positiveImpacts[0].impact * 100)}% for ${positiveImpacts[0].name}.`;
    } else if (keyChanges.length > 0 && keyChanges[0].value > 0.5) {
      mainUpside = `Optimized growth in ${keyChanges[0].label} to ${Math.round(keyChanges[0].value * 100)}%.`;
    }

    let mainRisk = "Minimal downstream risk projected for this path.";
    if (negativeImpacts.length > 0) {
      mainRisk = `Potential negative impact of ${Math.round(negativeImpacts[0].impact * 100)}% on ${negativeImpacts[0].name}.`;
    } else if (keyChanges.length > 0 && keyChanges[0].value < 0.5) {
      mainRisk = `Downside drift of ${keyChanges[0].label} to ${Math.round(keyChanges[0].value * 100)}%.`;
    }

    let signal = "Successful transition of key state variables.";
    if (steps.length > 0) {
      signal = `Observation of step transition: ${steps[0].label}.`;
    }

    let action = "Validate utility metrics against current strategic requirements.";
    if (steps.length > 0) {
      action = `Prepare tactical resources to execute: ${steps[0].label}.`;
    }

    let sentiment = "neutral";
    if (path.terminalUtility > 0.15) sentiment = "positive";
    else if (path.terminalUtility < -0.15) sentiment = "negative";

    return {
      title,
      probability_label: probLabel,
      outcome,
      main_risk: mainRisk,
      main_upside: mainUpside,
      signal,
      action,
      sentiment
    };
  };

  // Merge narratives back with computed path data for the UI
  const mergedResults = dominantPaths.map((path, i) => {
    const narrative = normalizedNarratives[i] || {};
    const fallback = generateFallbackNarrative(path, i);
    return {
      // Computed fields (always present)
      index: i + 1,
      probability_percent: Math.round(path.cumulativeProb * 100),
      utility_score: toFiniteNumber(path.terminalUtility, 0),
      causal_chain: path.operators.map((op) => ({
        operator_id: op.operator,
        operator_label: (decisionSpace.operator_labels || {})[op.operator]
          || op.operator.replace(/_/g, " "),
        probability_percent: Math.round((op.probability || 0) * 100),
      })),
      stakeholder_impacts: Object.entries(path.terminalNode?.utilities || {}).map(([k, v]) => ({
        stakeholder_id: k,
        stakeholder_label: (decisionSpace.stakeholder_labels || {})[k] || k,
        impact: toFiniteNumber(v, 0),
      })),
      // Narrative fields (from LLM, falling back to dynamic generation)
      title: narrative.title || fallback.title,
      probability_label: narrative.probability_label || fallback.probability_label,
      outcome: narrative.outcome || fallback.outcome,
      main_risk: narrative.main_risk || fallback.main_risk,
      main_upside: narrative.main_upside || fallback.main_upside,
      signal: narrative.signal || fallback.signal,
      action: narrative.action || fallback.action,
      sentiment: narrative.sentiment || fallback.sentiment,
    };
  });

  // Enforce semantic diversity on titles using Xenova embeddings
  const SIM_THRESHOLD = 0.85;
  const embeddings = [];

  for (let i = 0; i < mergedResults.length; i++) {
    const item = mergedResults[i];
    const fallback = generateFallbackNarrative(dominantPaths[i], i);
    let currentTitle = (item.title || "").trim();
    if (!currentTitle) {
      currentTitle = fallback.title;
      item.title = currentTitle;
    }

    let emb = null;
    try {
      emb = await getEmbedding(currentTitle, "xenova");
    } catch (err) {
      console.warn("[QueryAdapter] Title embedding failed:", err.message);
    }

    let isTooSimilar = false;
    if (emb) {
      for (const prevEmb of embeddings) {
        const sim = cosineSimilarity(emb, prevEmb);
        if (sim > SIM_THRESHOLD) {
          isTooSimilar = true;
          break;
        }
      }
    } else {
      // Fallback to exact match check if embeddings are unavailable
      for (let j = 0; j < i; j++) {
        if (mergedResults[j].title.toLowerCase() === currentTitle.toLowerCase()) {
          isTooSimilar = true;
          break;
        }
      }
    }

    if (isTooSimilar && currentTitle.toLowerCase() !== fallback.title.toLowerCase()) {
      console.log(`[QueryAdapter] Enforcing semantic diversity: Replacing duplicate/similar title "${currentTitle}" with distinct fallback "${fallback.title}"`);
      item.title = fallback.title;
      try {
        emb = await getEmbedding(fallback.title, "xenova");
      } catch (err) {
        emb = null;
      }
    }

    if (emb) {
      embeddings.push(emb);
    }
  }

  return mergedResults;
}

```

























---

simulith/src/tree/state_encoder.js:

```
import { callLLM as rawCallLLM } from "../llm/ai.js";
import { getDomainOntology } from "../data/ontology.js";
import {
  buildFallbackStateFromVariables,
  clamp,
  normalizeVariableDefinitions,
  parseJsonObjectFromText,
  safeStringify,
  toFiniteNumber,
} from "../utils/tree_runtime_utils.js";

const callLLM = typeof rawCallLLM === "function" ? rawCallLLM : async () => "";

/**
 * Initializes the S_0 state vector based on the seed decision and context.
 * The LLM may only emit bounded numeric initialization values.
 */
export async function encodeInitialState(decision, contextStr, domainName, ontologyOverride = null) {
  const ontology = ontologyOverride || getDomainOntology(domainName) || {};
  const variableDefs = normalizeVariableDefinitions(ontology.variables || {});
  const variableCatalog = Object.values(variableDefs).map((def) => ({
    name: def.name,
    min: def.min,
    max: def.max,
    defaultValue: def.defaultValue,
    description: def.description,
    type: def.type,
  }));

  const contextText =
    typeof contextStr === "string" ? contextStr : safeStringify(contextStr, "{}");

  const prompt = `You are the core State Encoder for a mathematical consequence engine.

Your task is to instantiate the starting State Vector (S_0) based on the user's decision context.

USER DECISION: ${JSON.stringify(String(decision ?? ""))}
CONTEXT: ${JSON.stringify(contextText)}
DOMAIN CONSTRAINT VARIABLES: ${JSON.stringify(variableCatalog)}

For each constraint variable, assign an initial numerical value within its allowed bounds.
Additionally, provide a short 1-line reason for WHY you inferred this starting value, and your confidence level (High, Medium, or Low).

Return ONLY valid JSON where keys are variable names and values are objects containing "value", "reason", and "confidence".

Example:
{
  "attrition_rate": { "value": 0.25, "reason": "Inferred from recent turnover context.", "confidence": "Medium" },
  "productivity": { "value": 0.80, "reason": "Default neutral baseline.", "confidence": "Low" }
}`;

  const rawOutput = await callLLM(prompt, 0.3);

  const parsed = parseJsonObjectFromText(rawOutput, {});
  const fallbackState = buildFallbackStateFromVariables(variableDefs);

  const stateVariables = {};
  const inferences = {};
  const parsedKeys = Object.keys(parsed);

  for (const [varName, def] of Object.entries(variableDefs)) {
    let rawObj = parsed[varName];
    if (rawObj === undefined) {
      const clean = (str) => String(str).toLowerCase().replace(/[\s_-]/g, "");
      const target = clean(varName);
      const foundKey = parsedKeys.find(k => clean(k) === target);
      if (foundKey !== undefined) {
        rawObj = parsed[foundKey];
      }
    }
    
    // Handle both old { varName: 0.25 } format and new { varName: { value: 0.25 } } format
    let rawValue, reason, confidence;
    if (typeof rawObj === 'object' && rawObj !== null && 'value' in rawObj) {
        rawValue = rawObj.value;
        reason = rawObj.reason || "Inferred from base context.";
        confidence = rawObj.confidence || "Medium";
    } else {
        rawValue = rawObj;
        reason = "Inferred from base context.";
        confidence = "Medium";
    }

    const numericValue = toFiniteNumber(rawValue, fallbackState[varName]);
    stateVariables[varName] = clamp(numericValue, def.min, def.max);
    stateVariables[varName] = toFiniteNumber(stateVariables[varName].toFixed(4), stateVariables[varName]);
    
    inferences[varName] = {
        reason,
        confidence
    };
  }

  return {
    id: "S0",
    variables: stateVariables,
    inferences: inferences,
    decision: String(decision ?? ""),
    context: contextStr,
    probability: 1.0,
    depth: 0,
    parent: null,
    children: [],
    utilities: {},
    stakeholder_utilities: {},
    utility_scalar: 0,
    generated_by: "state_encoder",
  };
}
```























---

simulith/src/tree/transition_engine.js:

```
import crypto from "crypto";
import { getDomainOntology } from "../data/ontology.js";
import { SHOCK_REGISTRY } from "../data/shocks.js";
import {
  clamp,
  normalizeInteractionDefinitions,
  normalizeOperatorDefinitions,
  normalizeVariableDefinitions,
  toFiniteNumber,
} from "../utils/tree_runtime_utils.js";
import { computeElasticDelta } from "./elasticity.js";

// Normal distribution sampler (Box-Muller transform).
function sampleGaussian(mean, variance, rng = Math.random) {
  const m = toFiniteNumber(mean, 0.0);
  const v = Math.max(0.0, toFiniteNumber(variance, 0.0));

  if (v === 0) return m;

  const u1 = Math.max(toFiniteNumber(rng(), 0.5), Number.EPSILON);
  const u2 = Math.max(toFiniteNumber(rng(), 0.5), Number.EPSILON);

  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return m + z0 * Math.sqrt(v);
}

function resolveEffectDefinition(effectDef) {
  if (typeof effectDef === "number") {
    return {
      magnitude: effectDef,
      elasticity: "flat",
    };
  }

  if (effectDef && typeof effectDef === "object") {
    return {
      magnitude: toFiniteNumber(
        effectDef.magnitude ??
          effectDef.delta ??
          effectDef.effect ??
          effectDef.value ??
          0,
        0
      ),
      elasticity:
        typeof effectDef.elasticity === "string" ? effectDef.elasticity : "flat",
    };
  }

  return {
    magnitude: 0,
    elasticity: "flat",
  };
}

/**
 * Computes S_{t+1} by applying the semantic projection of an operator to the current state.
 * This layer is 100% deterministic, representing the mathematical physics engine.
 */
export function calculateTransition(currentState, operatorName, projectedWeights, domainName) {
  const ontology = getDomainOntology(domainName) || {};
  const variableDefs = normalizeVariableDefinitions(ontology.variables || {});
  const operatorDefs = normalizeOperatorDefinitions(ontology.operators || {});
  const interactions = normalizeInteractionDefinitions(ontology.interactions || []);

  const parentVars = {
    ...(currentState?.variables || {}),
  };

  function findShockById(shockId) {
    if (!shockId) return null;
    const targetId = String(shockId).trim().toUpperCase();
    for (const domainKey of Object.keys(SHOCK_REGISTRY)) {
      const domainShocks = SHOCK_REGISTRY[domainKey];
      if (domainShocks) {
        const posMatch = (domainShocks.positive || []).find(s => String(s.id).toUpperCase() === targetId);
        if (posMatch) return posMatch;
        const negMatch = (domainShocks.negative || []).find(s => String(s.id).toUpperCase() === targetId);
        if (negMatch) return negMatch;
      }
    }
    return null;
  }

  // Initialize tracking variables for the new state
  const nextVars = { ...parentVars };
  const expectedVars = { ...parentVars };

  const appliedBaseDelta = {};
  const appliedDynamicDelta = {};
  const appliedInteractionDelta = {};
  
  const expectedDynamicDelta = {};
  const expectedInteractionDelta = {};

  // Step 1: deterministic base effects calculated via Semantic Projection weights
  for (const [opKey, weight] of Object.entries(projectedWeights || {})) {
    const opDef = operatorDefs[opKey];
    if (!opDef || !opDef.base_effects) continue;

    for (const [key, effectDef] of Object.entries(opDef.base_effects)) {
      if (!(key in nextVars)) continue;

      const varBounds = variableDefs[key] || { min: 0.0, max: 1.0 };
      const resolved = resolveEffectDefinition(effectDef);

      // Apply the weight to the magnitude
      const projectedMagnitude = resolved.magnitude * weight;

      const delta = computeElasticDelta(
        nextVars[key],
        projectedMagnitude,
        resolved.elasticity,
        varBounds.min,
        varBounds.max
      );

      nextVars[key] = toFiniteNumber(nextVars[key], 0.0) + delta;
      expectedVars[key] = toFiniteNumber(expectedVars[key], 0.0) + delta;
      appliedBaseDelta[key] = toFiniteNumber(appliedBaseDelta[key], 0.0) + delta;
    }
  }

  // Determine if this is a shock for variance amplification
  const parentInstability = toFiniteNumber(currentState?.instability, 0.0);
  const isShock = typeof operatorName === "string" && (operatorName.includes("_POS_") || operatorName.includes("_NEG_") || findShockById(operatorName));
  const shock = isShock ? findShockById(operatorName) : null;
  let shockSeverity = 0.0;
  if (isShock) {
    if (shock) {
      const sevStr = String(shock.severity || '').toLowerCase();
      if (sevStr === 'low') shockSeverity = 0.2;
      else if (sevStr === 'moderate') shockSeverity = 0.5;
      else if (sevStr === 'high') shockSeverity = 0.8;
      else if (sevStr === 'critical') shockSeverity = 1.0;
      else shockSeverity = toFiniteNumber(shock.severity, 0.5);
    }
  }

  // State Tracking: Gaussian Variable Migration
  // We explicitly track expected variables (means) and simulate the variance injection natively without LLMs
  for (const key of Object.keys(nextVars)) {
    // Add innate physics noise (variance) to the state 
    let variance = 0.01; // Base uncertainty
    if (isShock) {
      variance = variance * (1.0 + shockSeverity * 1.5);
      const polarity = operatorName.includes("_NEG_") ? -1 : 1;
      nextVars[key] += polarity * 0.05 * shockSeverity; 
    }
    const amplifiedVariance = variance * (1.0 + parentInstability * 2.0);
    const sampledDelta = sampleGaussian(0, amplifiedVariance);
    
    // The variance affects the actual sampled path, but expectedVars track the pure mean
    nextVars[key] = toFiniteNumber(nextVars[key], 0.0) + sampledDelta;
  }

  // Step 3: causal interactions.
  // Important: interactions are computed from the primary delta only, which keeps the update order-independent.
  for (const inter of interactions) {
    const { source, target } = inter;
    const coefficient = toFiniteNumber(inter.coefficient, 0.0);

    if (!(source in parentVars) || !(target in nextVars)) continue;

    const sourcePrimaryDelta =
      (appliedBaseDelta[source] ?? 0) + (appliedDynamicDelta[source] ?? 0);

    if (sourcePrimaryDelta !== 0) {
      const interactionDelta = sourcePrimaryDelta * coefficient;
      nextVars[target] = toFiniteNumber(nextVars[target], 0.0) + interactionDelta;
      appliedInteractionDelta[target] =
        toFiniteNumber(appliedInteractionDelta[target], 0.0) + interactionDelta;
    }

    // Expected interaction delta
    const expectedSourceDelta =
      (appliedBaseDelta[source] ?? 0) + (expectedDynamicDelta[source] ?? 0);

    if (expectedSourceDelta !== 0) {
      const expectedInterDelta = expectedSourceDelta * coefficient;
      expectedVars[target] = toFiniteNumber(expectedVars[target], 0.0) + expectedInterDelta;
      expectedInteractionDelta[target] =
        toFiniteNumber(expectedInteractionDelta[target], 0.0) + expectedInterDelta;
    }
  }

  // Step 4: enforce hard bounds.
  for (const [key, rules] of Object.entries(variableDefs)) {
    if (key in nextVars) {
      nextVars[key] = clamp(nextVars[key], rules.min, rules.max);
      nextVars[key] = toFiniteNumber(Number(nextVars[key]).toFixed(4), nextVars[key]);
    }
    if (key in expectedVars) {
      expectedVars[key] = clamp(expectedVars[key], rules.min, rules.max);
      expectedVars[key] = toFiniteNumber(Number(expectedVars[key]).toFixed(4), expectedVars[key]);
    }
  }

  return {
    id: "S_" + crypto.randomUUID().split("-")[0],
    parent: currentState?.id ?? null,
    operator: operatorName,
    variables: nextVars,
    expected_variables: expectedVars,
    depth: toFiniteNumber(currentState?.depth, 0) + 1,
    probability: 0,
    utilities: {},
    stakeholder_utilities: {},
    utility_scalar: 0,
    transition: {
      base_delta: appliedBaseDelta,
      dynamic_delta: appliedDynamicDelta,
      interaction_delta: appliedInteractionDelta,
    },
  };
}
```






















---

simulith/src/tree/tree_builder.js:

```
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

```





















---

simulith/src/tree/utility_scorer.js:

```
import { callLLM as rawCallLLM } from "../llm/ai.js";
import { getDomainOntology } from "../data/ontology.js";
import {
  clamp,
  normalizeStakeholderDefinitions,
  parseJsonObjectFromText,
  safeStringify,
  toFiniteNumber,
  weightedMean,
} from "../utils/tree_runtime_utils.js";

const callLLM = typeof rawCallLLM === "function" ? rawCallLLM : async () => "";

function computeScalarUtility(utilityVector, stakeholderDefs) {
  if (!utilityVector || typeof utilityVector !== "object") return 0.0;

  const values = [];
  const weights = [];

  for (const stakeholder of stakeholderDefs) {
    const rawValue =
      utilityVector[stakeholder.id] ??
      utilityVector[stakeholder.label] ??
      utilityVector[String(stakeholder.id)] ??
      0.0;

    values.push(clamp(toFiniteNumber(rawValue, 0.0), -1.0, 1.0));
    weights.push(Math.max(0.0001, toFiniteNumber(stakeholder.weight, 1.0)));
  }

  if (values.length === 0) return 0.0;
  return clamp(weightedMean(values, weights), -1.0, 1.0);
}

/**
 * Calculates U_i(S) for all stakeholders.
 * The LLM acts only as a constrained numeric approximator.
 */
export async function scoreStateUtilities(stateNode, domainName, ontologyOverride = null) {
  const ontology = ontologyOverride || getDomainOntology(domainName) || {};
  const stakeholderDefs = normalizeStakeholderDefinitions(ontology.stakeholders || []);

  if (stakeholderDefs.length === 0) {
    stateNode.utilities = {};
    stateNode.stakeholder_utilities = {};
    stateNode.utility_scalar = 0.0;
    return {};
  }

  const stakeholderCatalog = stakeholderDefs.map((s) => ({
    id: s.id,
    label: s.label,
    weight: s.weight,
    description: s.description,
  }));

  const prompt = `You are the Utility Function Evaluator U_i(S) for a simulation.

You do NOT roleplay. You do NOT write explanations.

A deterministic transition has resulted in the following numeric state:

STATE (S):
${safeStringify(stateNode?.variables || {}, "{}")}

STAKEHOLDERS:
${safeStringify(stakeholderCatalog, "[]")}

Calculate the utility score for each stakeholder based ONLY on the numeric state.
Return ONLY valid JSON mapping stakeholder IDs to floats in the range [-1.0, 1.0].

-1.0 = Maximally negative impact
 0.0 = Neutral
 1.0 = Maximally positive impact

Example:
{"Employees": -0.80, "Investors": 0.65}`;

  const rawOutput = await callLLM(prompt, 0.3);

  const parsed = parseJsonObjectFromText(rawOutput, {});
  const utilityVector = {};
  const parsedKeys = Object.keys(parsed);

  for (const stakeholder of stakeholderDefs) {
    let rawValue =
      parsed[stakeholder.id] ??
      parsed[stakeholder.label] ??
      parsed[String(stakeholder.id)];

    if (rawValue === undefined) {
      const clean = (str) => String(str).toLowerCase().replace(/[\s_-]/g, "");
      const targetId = clean(stakeholder.id);
      const targetLabel = clean(stakeholder.label);
      const foundKey = parsedKeys.find(k => {
        const ck = clean(k);
        return ck === targetId || ck === targetLabel;
      });
      if (foundKey !== undefined) {
        rawValue = parsed[foundKey];
      }
    }

    const numericValue = clamp(toFiniteNumber(rawValue, 0.0), -1.0, 1.0);
    utilityVector[stakeholder.id] = toFiniteNumber(numericValue.toFixed(4), numericValue);
  }

  stateNode.utilities = utilityVector;
  stateNode.stakeholder_utilities = utilityVector;
  stateNode.utility_scalar = computeScalarUtility(utilityVector, stakeholderDefs);

  return utilityVector;
}
```



















---

simulith/src/utils/tree_runtime_utils.js:

```
export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;

  let lo = Number(min);
  let hi = Number(max);

  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 1;

  if (lo > hi) {
    const tmp = lo;
    lo = hi;
    hi = tmp;
  }

  return Math.min(hi, Math.max(lo, n));
}

export function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function deepClone(value) {
  if (value === null || value === undefined) return value;

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // fall through
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function safeStringify(value, fallback = "{}") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function extractBalancedJsonBlock(text, openChar) {
  const source = String(text ?? "");
  const closeChar = openChar === "{" ? "}" : openChar === "[" ? "]" : null;
  if (!closeChar) return "";

  const start = source.indexOf(openChar);
  if (start < 0) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return "";
}

export function parseJsonObjectFromText(text, fallback = {}) {
  if (isPlainObject(text)) return deepClone(text);

  const raw = String(text ?? "");
  const block = extractBalancedJsonBlock(raw, "{");
  if (!block) return deepClone(fallback);

  try {
    const parsed = JSON.parse(block);
    return isPlainObject(parsed) ? parsed : deepClone(fallback);
  } catch {
    return deepClone(fallback);
  }
}

export function parseJsonArrayFromText(text, fallback = []) {
  if (Array.isArray(text)) return deepClone(text);

  const raw = String(text ?? "");
  const block = extractBalancedJsonBlock(raw, "[");
  if (!block) return deepClone(fallback);

  try {
    const parsed = JSON.parse(block);
    return Array.isArray(parsed) ? parsed : deepClone(fallback);
  } catch {
    return deepClone(fallback);
  }
}

function normaliseName(raw, fallbackPrefix, index) {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (isPlainObject(raw)) {
    const candidate =
      raw.id ??
      raw.name ??
      raw.key ??
      raw.variable ??
      raw.operator_id ??
      raw.stakeholder_id ??
      raw.source ??
      raw.target;

    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return `${fallbackPrefix}_${index}`;
}

export function collectNameList(value, fallbackPrefix = "item") {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => normaliseName(entry, fallbackPrefix, index))
      .filter(Boolean);
  }

  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, entry], index) => {
        if (typeof key === "string" && key.trim()) return key.trim();
        return normaliseName(entry, fallbackPrefix, index);
      })
      .filter(Boolean);
  }

  return [normaliseName(value, fallbackPrefix, 0)];
}

export function normalizeVariableDefinitions(rawVariables = {}) {
  const normalized = {};

  const addVariable = (name, def) => {
    if (!name || typeof name !== "string") return;

    let min = 0.0;
    let max = 1.0;
    let defaultValue = 0.5;
    let description = "";
    let type = "continuous";

    if (typeof def === "number") {
      // If a plain number is supplied, treat it as a hint for the default value.
      defaultValue = clamp(def, 0.0, 1.0);
    } else if (Array.isArray(def) && def.length >= 2) {
      min = toFiniteNumber(def[0], 0.0);
      max = toFiniteNumber(def[1], 1.0);
      defaultValue = clamp((min + max) / 2, min, max);
    } else if (isPlainObject(def)) {
      min = toFiniteNumber(def.min, 0.0);
      max = toFiniteNumber(def.max, 1.0);
      defaultValue = toFiniteNumber(
        def.defaultValue ?? def.default ?? def.initial ?? (min + max) / 2,
        (min + max) / 2
      );
      description = typeof def.description === "string" ? def.description : "";
      type = typeof def.type === "string" ? def.type : "continuous";
    }

    if (min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }

    defaultValue = clamp(defaultValue, min, max);

    normalized[name] = {
      name,
      min,
      max,
      defaultValue,
      description,
      type,
      raw: deepClone(def),
    };
  };

  if (Array.isArray(rawVariables)) {
    rawVariables.forEach((entry, index) => {
      if (typeof entry === "string") {
        addVariable(entry, {});
      } else if (isPlainObject(entry)) {
        addVariable(normaliseName(entry, "variable", index), entry);
      }
    });
    return normalized;
  }

  if (isPlainObject(rawVariables)) {
    for (const [key, value] of Object.entries(rawVariables)) {
      addVariable(key, value);
    }
    return normalized;
  }

  return normalized;
}

export function normalizeOperatorDefinitions(rawOperators = {}) {
  const normalized = {};

  const addOperator = (name, def) => {
    if (!name || typeof name !== "string") return;

    const baseEffects = isPlainObject(def?.base_effects) ? deepClone(def.base_effects) : {};
    const dynamicEffects = collectNameList(def?.dynamic_effects, "dynamic_effect");
    const tags = Array.isArray(def?.tags) ? def.tags.filter((t) => typeof t === "string") : [];
    const description = typeof def?.description === "string" ? def.description : "";

    normalized[name] = {
      operator_id: name,
      name,
      description,
      base_effects: baseEffects,
      dynamic_effects: dynamicEffects,
      tags,
      raw: deepClone(def),
    };
  };

  if (Array.isArray(rawOperators)) {
    rawOperators.forEach((entry, index) => {
      if (typeof entry === "string") {
        addOperator(entry, {});
      } else if (isPlainObject(entry)) {
        const name = normaliseName(entry, "operator", index);
        addOperator(name, entry);
      }
    });
    return normalized;
  }

  if (isPlainObject(rawOperators)) {
    for (const [key, value] of Object.entries(rawOperators)) {
      if (isPlainObject(value) || Array.isArray(value) || typeof value === "string") {
        addOperator(key, value);
      } else {
        addOperator(key, {});
      }
    }
    return normalized;
  }

  return normalized;
}

export function normalizeStakeholderDefinitions(rawStakeholders = {}) {
  const normalized = [];

  const addStakeholder = (name, def, index) => {
    if (!name || typeof name !== "string") return;

    let label = name;
    let weight = 1.0;
    let description = "";

    if (isPlainObject(def)) {
      label = typeof def.label === "string" ? def.label : label;
      weight = toFiniteNumber(def.weight ?? def.leverage ?? 1.0, 1.0);
      description = typeof def.description === "string" ? def.description : "";
    }

    normalized.push({
      id: name,
      label,
      weight,
      description,
      index,
      raw: deepClone(def),
    });
  };

  if (Array.isArray(rawStakeholders)) {
    rawStakeholders.forEach((entry, index) => {
      if (typeof entry === "string") {
        addStakeholder(entry, {}, index);
      } else if (isPlainObject(entry)) {
        addStakeholder(normaliseName(entry, "stakeholder", index), entry, index);
      }
    });
    return normalized;
  }

  if (isPlainObject(rawStakeholders)) {
    let i = 0;
    for (const [key, value] of Object.entries(rawStakeholders)) {
      addStakeholder(key, value, i);
      i += 1;
    }
    return normalized;
  }

  return normalized;
}

export function normalizeInteractionDefinitions(rawInteractions = []) {
  if (!rawInteractions) return [];

  const normalized = [];

  const addInteraction = (entry, index, fallbackSource, fallbackTarget) => {
    if (!isPlainObject(entry)) return;

    const source = typeof entry.source === "string" ? entry.source : fallbackSource;
    const target = typeof entry.target === "string" ? entry.target : fallbackTarget;

    if (!source || !target) return;

    normalized.push({
      source,
      target,
      coefficient: toFiniteNumber(entry.coefficient ?? entry.weight ?? 0, 0),
      lag: toFiniteNumber(entry.lag ?? 0, 0),
      description: typeof entry.description === "string" ? entry.description : "",
      index,
      raw: deepClone(entry),
    });
  };

  if (Array.isArray(rawInteractions)) {
    rawInteractions.forEach((entry, index) => {
      if (isPlainObject(entry)) {
        addInteraction(entry, index);
      }
    });
    return normalized;
  }

  if (isPlainObject(rawInteractions)) {
    let i = 0;
    for (const [key, value] of Object.entries(rawInteractions)) {
      if (isPlainObject(value)) {
        addInteraction(value, i, value.source ?? key, value.target);
      }
      i += 1;
    }
    return normalized;
  }

  return normalized;
}

export function getVariableMidpoint(variableDef) {
  const min = toFiniteNumber(variableDef?.min, 0.0);
  const max = toFiniteNumber(variableDef?.max, 1.0);
  return (min + max) / 2;
}

export function buildFallbackStateFromVariables(variableDefs) {
  const state = {};
  for (const [name, def] of Object.entries(variableDefs || {})) {
    state[name] = clamp(
      toFiniteNumber(def?.defaultValue, getVariableMidpoint(def)),
      def?.min ?? 0.0,
      def?.max ?? 1.0
    );
  }
  return state;
}

export function weightedMean(values, weights) {
  if (!Array.isArray(values) || values.length === 0) return 0;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < values.length; i += 1) {
    const v = toFiniteNumber(values[i], 0);
    const w = Array.isArray(weights) ? toFiniteNumber(weights[i], 1) : 1;
    numerator += v * w;
    denominator += w;
  }

  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function computePathEditDistance(p1, p2) {
  const m = p1?.length || 0;
  const n = p2?.length || 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (p1[i - 1] === p2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],
          dp[i][j - 1],
          dp[i - 1][j - 1]
        );
      }
    }
  }
  return dp[m][n];
}

export function computeCausalStateDistance(varsA, varsB) {
  const keysA = Object.keys(varsA || {});
  const keysB = Object.keys(varsB || {});
  const allKeys = Array.from(new Set([...keysA, ...keysB]));
  if (allKeys.length === 0) return 0.0;

  let sumSq = 0.0;
  for (const k of allKeys) {
    const valA = toFiniteNumber(varsA?.[k], 0.0);
    const valB = toFiniteNumber(varsB?.[k], 0.0);
    sumSq += (valA - valB) ** 2;
  }
  return Math.sqrt(sumSq) / allKeys.length;
}

export function computeUtilityDistance(utilsA, utilsB) {
  const keysA = Object.keys(utilsA || {});
  const keysB = Object.keys(utilsB || {});
  const allKeys = Array.from(new Set([...keysA, ...keysB]));
  if (allKeys.length === 0) return 0.0;

  let sumAbs = 0.0;
  for (const k of allKeys) {
    const valA = toFiniteNumber(utilsA?.[k], 0.0);
    const valB = toFiniteNumber(utilsB?.[k], 0.0);
    sumAbs += Math.abs(valA - valB);
  }
  return sumAbs / allKeys.length;
}
```