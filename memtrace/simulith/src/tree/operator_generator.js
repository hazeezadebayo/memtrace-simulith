/* ==================================================================
   simulith/src/tree/operator_generator.js
   Module 2: Operator Generator
   Maps a decision to allowed constraint transitions (Operators).
   ================================================================== */
import { callLLM as rawCallLLM } from "../llm/ai.js";
import { getDomainOntology } from "../data/ontology.js";
import {
  normalizeOperatorDefinitions,
  parseJsonArrayFromText,
  safeStringify,
} from "../utils/tree_runtime_utils.js";
import { getEmbedding, cosineSimilarity } from "../../../extension/llm/embedding.js";

const callLLM = typeof rawCallLLM === "function" ? rawCallLLM : async () => "";

function normalizeTextKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_\-—–.,;:'"!?()[\]{}]/g, "")
    .trim();
}

function stripQuotes(value) {
  let text = String(value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

class OperatorGenerationEngine {
  constructor(decision, domainName, branchingFactor = 3, ontologyOverride = null, pathHistory = []) {
    this.decision = String(decision ?? "");
    this.domainName = String(domainName ?? "COMMON");
    this.branchingFactor = Math.max(1, Math.floor(Number(branchingFactor) || 3));
    this.ontologyOverride = ontologyOverride || null;
    this.pathHistory = Array.isArray(pathHistory) ? pathHistory.map((item) => String(item ?? "")) : [];

    this.ontology = this.ontologyOverride || getDomainOntology(this.domainName) || {};
    this.operatorDefs = normalizeOperatorDefinitions(this.ontology.operators || {});
    this.allowedOperatorNames = Object.keys(this.operatorDefs);

    this.operatorCatalog = this.allowedOperatorNames.map((name) => {
      const def = this.operatorDefs[name];
      return {
        operator_id: name,
        description: def.description || "",
        base_effect_variables: Object.keys(def.base_effects || {}),
        dynamic_effects: def.dynamic_effects || [],
        tags: def.tags || [],
      };
    });

    this.embeddingCache = new Map();
    this.operatorEmbeddingCache = new Map();
    this.pathHistoryNormalized = this.pathHistory.map((item) => normalizeTextKey(item)).filter(Boolean);
  }

  async getEmbeddingCached(text) {
    const key = normalizeTextKey(text);
    if (!key) return null;

    if (this.embeddingCache.has(key)) {
      return this.embeddingCache.get(key);
    }

    try {
      const embedding = await getEmbedding(text, "xenova");
      this.embeddingCache.set(key, embedding);
      return embedding;
    } catch (e) {
      if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
      this.embeddingCache.set(key, null);
      return null;
    }
  }

  async getOperatorEmbeddings() {
    const embeddings = {};
    for (const opName of this.allowedOperatorNames) {
      const def = this.operatorDefs[opName];
      const text = def.description || opName;

      if (this.operatorEmbeddingCache.has(opName)) {
        embeddings[opName] = this.operatorEmbeddingCache.get(opName);
        continue;
      }

      try {
        const emb = await getEmbedding(text, "xenova");
        this.operatorEmbeddingCache.set(opName, emb);
        embeddings[opName] = emb;
      } catch (e) {
        if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
        this.operatorEmbeddingCache.set(opName, null);
        embeddings[opName] = null;
      }
    }
    return embeddings;
  }

  buildPrompt() {
    const pathHistoryStr = this.pathHistory.length > 0 ? JSON.stringify(this.pathHistory) : "None (Root node)";

    return `You are the Creative Strategist for a state-space engine.

Based on the USER DECISION and current state, generate exactly ${this.branchingFactor} distinct, highly contextual actions that the user could take right now.

USER DECISION: ${JSON.stringify(this.decision)}
PATH HISTORY (Prior actions taken in this timeline): ${pathHistoryStr}

ALLOWED OPERATOR CATALOG:
${safeStringify(this.operatorCatalog, "[]")}

CRITICAL INSTRUCTIONS:
1. Generate highly specific, human-readable phrases describing the action.
2. Do NOT return actions that are conceptually identical to actions in the PATH HISTORY.
3. Do NOT return duplicate or near-duplicate actions within the same list.
4. Be creative but realistic.
5. Stay grounded in the allowed operator catalog.

Return ONLY a JSON array of strings representing the action labels.
Do not output any objects or IDs.

Example:
[
  "Pause development to fix tech debt",
  "Launch an aggressive marketing campaign",
  "Reassign senior staff to retention work"
]`;
  }

  parseActionLabels(rawOutput) {
    const parsedLabels = parseJsonArrayFromText(rawOutput, []);
    if (!Array.isArray(parsedLabels)) return [];

    const unique = [];
    const seen = new Set();

    for (const label of parsedLabels) {
      if (typeof label !== "string") continue;
      const cleaned = stripQuotes(label).trim();
      if (!cleaned) continue;

      const key = normalizeTextKey(cleaned);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(cleaned);
    }

    return unique;
  }

  fallbackLabels() {
    const labels = [];
    for (const name of this.allowedOperatorNames) {
      const label = this.ontology.operator_labels?.[name] || name.replace(/_/g, " ");
      labels.push(String(label));
    }
    return labels;
  }

  isTooSimilarToHistory(label) {
    const normalized = normalizeTextKey(label);
    if (!normalized) return true;

    if (this.pathHistoryNormalized.includes(normalized)) {
      return true;
    }

    for (const past of this.pathHistoryNormalized) {
      if (past === normalized) return true;
    }

    return false;
  }

  async selectLabels() {
    let rawOutput = "[]";
    try {
      rawOutput = await callLLM(this.buildPrompt(), 0.5);
    } catch (e) {
      if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
      console.warn("[OperatorGenerator] LLM operator generation failed:", e);
    }

    let actionLabels = this.parseActionLabels(rawOutput);
    actionLabels = actionLabels.filter((label) => !this.isTooSimilarToHistory(label));

    if (actionLabels.length < this.branchingFactor) {
      const fallback = this.fallbackLabels().filter((label) => !this.isTooSimilarToHistory(label));
      for (const label of fallback) {
        if (actionLabels.length >= this.branchingFactor) break;
        const key = normalizeTextKey(label);
        if (!actionLabels.some((existing) => normalizeTextKey(existing) === key)) {
          actionLabels.push(label);
        }
      }
    }

    if (actionLabels.length < this.branchingFactor && this.allowedOperatorNames.length > 0) {
      for (const name of this.allowedOperatorNames) {
        if (actionLabels.length >= this.branchingFactor) break;
        const label = this.ontology.operator_labels?.[name] || name.replace(/_/g, " ");
        const key = normalizeTextKey(label);
        if (!actionLabels.some((existing) => normalizeTextKey(existing) === key)) {
          actionLabels.push(label);
        }
      }
    }

    return actionLabels.slice(0, this.branchingFactor);
  }

  async computeProjectedWeights(label, labelEmbedding, ontologyEmbeddings, primaryOperatorId) {
    const projectedWeights = {};

    if (labelEmbedding) {
      const similarities = [];
      for (const opName of this.allowedOperatorNames) {
        const opEmbedding = ontologyEmbeddings[opName];
        if (!opEmbedding) continue;

        const sim = cosineSimilarity(labelEmbedding, opEmbedding);
        if (sim > 0.1) {
          similarities.push({ opName, sim });
        }
      }

      if (similarities.length > 0) {
        const maxSim = Math.max(...similarities.map((item) => item.sim));
        let expSum = 0;

        const exps = similarities.map((item) => {
          const val = Math.exp((item.sim - maxSim) * 5.0);
          expSum += val;
          return { opName: item.opName, val };
        });

        for (const item of exps) {
          projectedWeights[item.opName] = item.val / expSum;
        }
      } else if (primaryOperatorId) {
        projectedWeights[primaryOperatorId] = 1.0;
      }
    } else if (primaryOperatorId) {
      projectedWeights[primaryOperatorId] = 1.0;
    }

    if (Object.keys(projectedWeights).length === 0 && primaryOperatorId) {
      projectedWeights[primaryOperatorId] = 1.0;
    }

    return projectedWeights;
  }

  async selectPrimaryOperator(label, labelEmbedding, ontologyEmbeddings, usedPrimaryOperators) {
    if (this.allowedOperatorNames.length === 0) return null;

    if (!labelEmbedding) {
      const unused = this.allowedOperatorNames.find((name) => !usedPrimaryOperators.has(name));
      return unused || this.allowedOperatorNames[0];
    }

    const scored = [];
    for (const opName of this.allowedOperatorNames) {
      const opEmbedding = ontologyEmbeddings[opName];
      if (!opEmbedding) continue;

      let score = cosineSimilarity(labelEmbedding, opEmbedding);
      if (usedPrimaryOperators.has(opName)) {
        score -= 0.05;
      }

      if (score > 0.05) {
        scored.push({ opName, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const bestUnused = scored.find((item) => !usedPrimaryOperators.has(item.opName));
      if (bestUnused) return bestUnused.opName;
      return scored[0].opName;
    }

    const fallbackUnused = this.allowedOperatorNames.find((name) => !usedPrimaryOperators.has(name));
    return fallbackUnused || this.allowedOperatorNames[0];
  }

  async generate() {
    if (this.allowedOperatorNames.length === 0) {
      return [];
    }

    const actionLabels = await this.selectLabels();
    const ontologyEmbeddings = await this.getOperatorEmbeddings();

    const validOperators = [];
    const usedPrimaryOperators = new Set();

    for (const label of actionLabels) {
      const cleanedLabel = stripQuotes(label).trim();
      if (!cleanedLabel) continue;

      let labelEmbedding = null;
      try {
        labelEmbedding = await this.getEmbeddingCached(cleanedLabel);
      } catch (e) {
        if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
        labelEmbedding = null;
      }

      const primaryOperatorId = await this.selectPrimaryOperator(
        cleanedLabel,
        labelEmbedding,
        ontologyEmbeddings,
        usedPrimaryOperators
      );

      if (!primaryOperatorId) continue;
      usedPrimaryOperators.add(primaryOperatorId);

      const projectedWeights = await this.computeProjectedWeights(
        cleanedLabel,
        labelEmbedding,
        ontologyEmbeddings,
        primaryOperatorId
      );

      validOperators.push({
        operator_id: primaryOperatorId,
        action_label: cleanedLabel,
        projected_weights: projectedWeights,
      });
    }

    return validOperators;
  }
}

/**
 * Generates an array of operator IDs that are valid for the current domain ontology.
 * The LLM may rank/select only from the allowed operator set.
 */
export async function generateOperators(
  decision,
  domainName,
  branchingFactor = 3,
  ontologyOverride = null,
  pathHistory = []
) {
  const engine = new OperatorGenerationEngine(
    decision,
    domainName,
    branchingFactor,
    ontologyOverride,
    pathHistory
  );

  return engine.generate();
}