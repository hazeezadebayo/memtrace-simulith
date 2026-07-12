/* ==================================================================
   simulith/src/tree/utility_scorer.js
   Module 5 (Layer 3): Utility Scorer
   Strict functional mapping of state variables to a stakeholder utility score.
   ================================================================== */
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