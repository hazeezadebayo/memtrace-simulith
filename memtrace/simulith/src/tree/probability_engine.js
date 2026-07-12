/* ==================================================================
   simulith/src/tree/probability_engine.js
   Module 4: Probability Engine
   Computes transition likelihoods based on Stakeholder Utility.
   ================================================================== */

/**
 * Given an array of sibling state candidate nodes (which already have .utilities calculated),
 * computes their relative probabilities summing to 1.0 using a Softmax function.
 */
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