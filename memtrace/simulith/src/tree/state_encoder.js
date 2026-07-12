/* ==================================================================
   simulith/src/tree/state_encoder.js
   Module 1: State Encoder
   Initializes the starting state vector S_0 from user context.
   ================================================================== */
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