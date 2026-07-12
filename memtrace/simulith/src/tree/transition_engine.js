/* ==================================================================
   simulith/src/tree/transition_engine.js
   Layer 1: Physics Engine
   DETERMINISTIC. No LLM. Computes S_{t+1} using context-conditioned elasticity.
   Formula: S_{t+1} = S_t + Δ_elastic(S_t, O) + Δ_sampled(θ~D(μ,σ)) + Δ_cascade
   ================================================================== */
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