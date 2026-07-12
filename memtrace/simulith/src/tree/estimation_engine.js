/* ==================================================================
   simulith/src/tree/estimation_engine.js
   Module 2 (Layer 2): Estimation Engine
   LLM provides bounded statistical distributions for unknown parameters.
   ================================================================== */
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