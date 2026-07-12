/* ==================================================================
   simulith/src/tree/query_adapter.js
   Query Adapter — Two-phase LLM translation layer

   Phase 1: generateDecisionSpace()
     Takes the user's raw decision + base domain ontology and asks
     the LLM to inject query-specific variables, operators, and
     stakeholders. The enriched ontology is returned and fed to the
     deterministic tree engine.  The base ontology is NEVER discarded;
     query-specific additions are *merged* on top.

   Phase 2: explainDominantFutures()
     After the tree is built, this function receives the top paths and
     translates each one into a plain-English "Dominant Future" card
     that a non-technical user can read and act on.
   ================================================================== */
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

function normalizeTextKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_\-—–.,;:'"!?()[\]{}]/g, "")
    .trim();
}

function stripQuotes(value) {
  let text = String(value ?? "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function pickFirstString(source, keys) {
  if (!source || typeof source !== "object") return "";
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function deepCloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = stripQuotes(value).trim();
    if (!text) continue;
    const key = normalizeTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

class SemanticDiversityGuard {
  constructor(threshold = 0.84) {
    this.threshold = threshold;
    this.registry = new Map();
    this.embeddingCache = new Map();
  }

  normalize(text) {
    return normalizeTextKey(text);
  }

  async embed(text) {
    const normalized = this.normalize(text);
    if (!normalized) return null;

    if (this.embeddingCache.has(normalized)) {
      return this.embeddingCache.get(normalized);
    }

    try {
      const embedding = await getEmbedding(text, "xenova");
      this.embeddingCache.set(normalized, embedding);
      return embedding;
    } catch (e) {
      if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
      this.embeddingCache.set(normalized, null);
      return null;
    }
  }

  async register(field, text) {
    const normalized = this.normalize(text);
    if (!normalized) return;

    const list = this.registry.get(field) || [];
    const embedding = await this.embed(text);
    list.push({ text, normalized, embedding });
    this.registry.set(field, list);
  }

  async tooSimilar(field, text) {
    const normalized = this.normalize(text);
    if (!normalized) return false;

    const list = this.registry.get(field) || [];
    for (const entry of list) {
      if (entry.normalized === normalized) {
        return true;
      }
    }

    const embedding = await this.embed(text);
    if (!embedding) return false;

    for (const entry of list) {
      if (!entry.embedding) continue;
      const sim = cosineSimilarity(embedding, entry.embedding);
      if (sim >= this.threshold) return true;
    }

    return false;
  }

  async chooseUnique(field, candidates, fallbackFactory) {
    const cleanedCandidates = uniqueStrings(asArray(candidates));

    for (const candidate of cleanedCandidates) {
      if (!(await this.tooSimilar(field, candidate))) {
        await this.register(field, candidate);
        return candidate;
      }
    }

    const fallback =
      typeof fallbackFactory === "function"
        ? stripQuotes(fallbackFactory()).trim()
        : "";

    if (fallback && !(await this.tooSimilar(field, fallback))) {
      await this.register(field, fallback);
      return fallback;
    }

    const lastResort = fallback || "Unspecified";
    await this.register(field, lastResort);
    return lastResort;
  }
}

class FutureNarrativeComposer {
  constructor(decision, dominantPaths, decisionSpace) {
    this.decision = String(decision ?? "");
    this.dominantPaths = asArray(dominantPaths);
    this.decisionSpace = safeObject(decisionSpace);
    this.guard = new SemanticDiversityGuard(0.84);
  }

  buildPathDescriptors() {
    const variableLabels = safeObject(this.decisionSpace.variable_labels);
    const operatorLabels = safeObject(this.decisionSpace.operator_labels);
    const stakeholderLabels = safeObject(this.decisionSpace.stakeholder_labels);

    return this.dominantPaths.map((path, i) => {
      const pathObj = safeObject(path);
      const operators = asArray(pathObj.operators);

      const probabilityPercent = Math.round(
        clamp(toFiniteNumber(pathObj.cumulativeProb, 0), 0, 1) * 100
      );

      const utilityScore = toFiniteNumber(pathObj.terminalUtility, 0);

      const causalSteps = operators.map((op) => ({
        action:
          operatorLabels[op?.operator] ||
          operatorLabels[op?.operator_id] ||
          String(op?.operator || op?.operator_id || "").replace(/_/g, " "),
        probability: Math.round(
          clamp(toFiniteNumber(op?.probability, 0), 0, 1) * 100
        ),
      }));

      const terminalVars = safeObject(pathObj.terminalNode?.variables);
      const keyVariableStates = Object.entries(terminalVars)
        .map(([k, v]) => ({
          label: variableLabels[k] || String(k).replace(/_/g, " "),
          value: toFiniteNumber(v, 0),
        }))
        .sort((a, b) => Math.abs(b.value - 0.5) - Math.abs(a.value - 0.5))
        .slice(0, 4);

      const stakeholderImpacts = Object.entries(
        safeObject(pathObj.terminalNode?.utilities)
      )
        .map(([k, v]) => ({
          name: stakeholderLabels[k] || String(k).replace(/_/g, " "),
          impact: toFiniteNumber(v, 0),
        }))
        .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

      return {
        index: i + 1,
        probability_percent: probabilityPercent,
        utility_score: utilityScore,
        causal_steps: causalSteps,
        key_variable_states: keyVariableStates,
        stakeholder_impacts: stakeholderImpacts,
      };
    });
  }

  buildPrompt(pathDescriptors) {
    return `You are the Decision Interpreter for a causal forecasting system.

A user asked: ${JSON.stringify(this.decision)}

The simulation has computed ${pathDescriptors.length} dominant futures.

Write a distinct narrative for each future. The fields must be different across futures whenever the path content differs.
Signal must be an observable indicator, not a restatement of the action.
Action must be a concrete step the user can take now, not a prediction.
Do not reuse the same phrasing across multiple futures.
Do not use generic placeholders.
Do not use titles like "Future 1" or "Scenario A".

COMPUTED FUTURES:
${safeStringify(pathDescriptors, "[]")}

Return a JSON array of objects, one object per future.
Each object must have exactly these keys:
- title: A highly distinct and specific 5-8 word headline that highlights the unique final step or differentiating theme of this future
- probability_label: e.g. "Very Likely (78%)" or "Possible (34%)"
- outcome: 2-3 sentences in plain, direct language describing what this future looks like for the user
- main_risk: One specific sentence naming the biggest danger in this path
- main_upside: One specific sentence naming the best opportunity in this path
- signal: One observable thing the user can watch to know this future is unfolding
- action: One concrete thing the user could do RIGHT NOW to navigate this future
- sentiment: "positive", "negative", or "neutral"

Return ONLY valid JSON.`;
  }

  sanitizeNarrativeItem(item) {
    const rawObj = safeObject(item);
    const obj = {};
    for (const [k, v] of Object.entries(rawObj)) {
      const normalizedKey = k.toLowerCase().replace(/[-\s_]+/g, "_");
      obj[normalizedKey] = v;
    }
    return {
      title: pickFirstString(obj, ["title", "headline", "name"]),
      probability_label: pickFirstString(obj, ["probability_label", "probability", "probability_text"]),
      outcome: pickFirstString(obj, ["outcome", "result", "description"]),
      main_risk: pickFirstString(obj, ["main_risk", "risk", "risk_factors"]),
      main_upside: pickFirstString(obj, ["main_upside", "upside", "opportunity"]),
      signal: pickFirstString(obj, [
        "signal",
        "signal_to_watch",
        "watch_signal",
        "observation_signal",
        "observable_signal",
      ]),
      action: pickFirstString(obj, [
        "action",
        "recommended_action",
        "action_you_can_take_now",
        "next_step",
      ]),
      sentiment: pickFirstString(obj, ["sentiment"]),
    };
  }

  parseNarratives(rawText) {
    const raw = String(rawText ?? "");
    const blocks = raw
      .split(
        /(?:\[\s*FUTURE\s*\d+\s*\]|\bFUTURE\s*\d+\b[:\-\s]*|###\s*FUTURE\s*\d+|\*\*FUTURE\s*\d+\*\*)/i
      )
      .filter((block) => block.trim().length > 0);

    const narratives = [];

    for (const block of blocks) {
      const narrative = {};
      const lines = block.split("\n");
      let currentKey = null;

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const match = line.match(/^\s*[-*#\s]*\**([A-Z0-9_-\s]+)\**:\s*(.*)$/i);
        if (match) {
          currentKey = match[1].trim().replace(/[-\s]+/g, "_").toLowerCase();
          let val = stripQuotes(match[2].trim());
          narrative[currentKey] = val;
        } else if (currentKey) {
          narrative[currentKey] = `${String(narrative[currentKey] || "").trim()} ${line}`.trim();
        }
      }

      if (Object.keys(narrative).length > 0) {
        narratives.push(narrative);
      }
    }

    if (narratives.length > 0) {
      return narratives;
    }

    const parsedArray = parseJsonArrayFromText(raw, []);
    if (Array.isArray(parsedArray) && parsedArray.length > 0) {
      return parsedArray;
    }

    const parsedObject = parseJsonObjectFromText(raw, null);
    if (parsedObject && typeof parsedObject === "object") {
      for (const val of Object.values(parsedObject)) {
        if (Array.isArray(val) && val.length > 0) {
          return val;
        }
      }
    }

    return [];
  }

  buildProbabilityLabel(probabilityPercent) {
    let label = "Possible";
    if (probabilityPercent >= 75) label = "Very Likely";
    else if (probabilityPercent >= 45) label = "Likely";
    else if (probabilityPercent >= 20) label = "Possible";
    else label = "Unlikely";
    return `${label} (${probabilityPercent}%)`;
  }

  buildSignalCandidates(profile) {
    const candidates = [];
    const p = safeObject(profile);

    if (asArray(p.key_variable_states).length > 0) {
      const top = p.key_variable_states[0];
      const pct = Math.round(clamp(toFiniteNumber(top?.value, 0), 0, 1) * 100);
      const direction = toFiniteNumber(top?.value, 0) >= 0.5 ? "rising" : "falling";
      const intensity =
        Math.abs(toFiniteNumber(top?.value, 0) - 0.5) > 0.25 ? "sharply" : "gradually";
      candidates.push(`Watch ${top.label} ${intensity} ${direction} toward ${pct}%`);
      candidates.push(`Watch for ${top.label} to move past ${pct}%`);
    }

    if (asArray(p.stakeholder_impacts).length > 0) {
      const impact = p.stakeholder_impacts[0];
      const pct = Math.round(Math.abs(toFiniteNumber(impact?.impact, 0)) * 100);
      const direction = toFiniteNumber(impact?.impact, 0) >= 0 ? "improving" : "deteriorating";
      candidates.push(`Watch ${impact.name} impact ${direction} by about ${pct}%`);
    }

    if (asArray(p.causal_steps).length > 0) {
      const first = p.causal_steps[0].action;
      candidates.push(`Watch the execution of ${first} to confirm this path`);
    }

    candidates.push("Watch for the system to hold near baseline");
    return uniqueStrings(candidates);
  }

  buildActionCandidates(profile) {
    const candidates = [];
    const p = safeObject(profile);

    if (asArray(p.causal_steps).length > 0) {
      const first = p.causal_steps[0].action;
      const last = p.causal_steps[p.causal_steps.length - 1].action;
      candidates.push(`Act now by prioritizing ${first}`);
      if (p.causal_steps.length > 1) {
        candidates.push(`Act by using ${first} to move toward ${last}`);
      }
    }

    if (asArray(p.key_variable_states).length > 0) {
      const top = p.key_variable_states[0];
      candidates.push(`Act by directly improving ${top.label}`);
      candidates.push(`Act by reallocating resources toward ${top.label}`);
    }

    if (asArray(p.stakeholder_impacts).length > 0) {
      const impact = p.stakeholder_impacts[0];
      candidates.push(`Act by protecting ${impact.name} from downside drift`);
      if (toFiniteNumber(impact?.impact, 0) >= 0) {
        candidates.push(`Act by reinforcing what is already helping ${impact.name}`);
      }
    }

    candidates.push("Act by tightening the current operating plan");
    return uniqueStrings(candidates);
  }

  buildFallbackNarrative(profile) {
    const p = safeObject(profile);
    const causalSteps = asArray(p.causal_steps);
    const keyVariableStates = asArray(p.key_variable_states);
    const stakeholderImpacts = asArray(p.stakeholder_impacts);

    const titlePrefix =
      toFiniteNumber(p.utility_score, 0) > 0.2
        ? "Progressive Path"
        : toFiniteNumber(p.utility_score, 0) < -0.2
          ? "Risk Exposure"
          : "Stabilization";

    let title = `Future ${toFiniteNumber(p.index, 1) || 1}`;

    if (causalSteps.length > 0) {
      const firstStep = causalSteps[0]?.action || "an action";
      if (causalSteps.length > 1) {
        const lastStep = causalSteps[causalSteps.length - 1]?.action || firstStep;
        title = `${titlePrefix} via ${firstStep} to ${lastStep}`;
      } else {
        title = `${titlePrefix} via ${firstStep}`;
      }
    } else if (keyVariableStates.length > 0) {
      title = `${titlePrefix} around ${keyVariableStates[0]?.label || "key variable"}`;
    }

    if (title.length > 150) {
      title = `${title.slice(0, 147)}...`;
    }

    const probPercent = Math.round(clamp(toFiniteNumber(p.probability_percent, 0), 0, 100));
    const probabilityLabel = this.buildProbabilityLabel(probPercent);

    let outcome = "";
    if (causalSteps.length > 0) {
      const firstStep = causalSteps[0]?.action || "the first step";
      outcome = `This path begins with ${firstStep}.`;
      if (causalSteps.length > 1) {
        const rest = causalSteps
          .slice(1)
          .map((s) => s?.action || "the next step")
          .join(", then ");
        outcome += ` It then progresses through ${rest}.`;
      }
    } else {
      outcome = "This path keeps the system near its current baseline.";
    }

    if (keyVariableStates.length > 0) {
      const c = keyVariableStates[0];
      const pct = Math.round(clamp(toFiniteNumber(c?.value, 0), 0, 1) * 100);
      const direction = toFiniteNumber(c?.value, 0) >= 0.5 ? "higher" : "lower";
      outcome += ` The key change is ${c.label} moving toward ${pct}%, which pushes the system ${direction}.`;
    }

    if (stakeholderImpacts.length > 0) {
      const s = stakeholderImpacts[0];
      const pct = Math.round(Math.abs(toFiniteNumber(s?.impact, 0)) * 100);
      const direction = toFiniteNumber(s?.impact, 0) >= 0 ? "positive" : "negative";
      outcome += ` ${s.name} experiences a ${direction} shift of about ${pct}%.`;
    }

    let mainUpside = "This path creates a clear operating direction.";
    const positiveImpact = stakeholderImpacts.find((item) => toFiniteNumber(item?.impact, 0) > 0.05);
    if (positiveImpact) {
      const pct = Math.round(Math.abs(toFiniteNumber(positiveImpact?.impact, 0)) * 100);
      mainUpside = `It delivers a positive lift for ${positiveImpact.name} of about ${pct}%.`;
    } else if (keyVariableStates.length > 0 && toFiniteNumber(keyVariableStates[0]?.value, 0) > 0.5) {
      const c = keyVariableStates[0];
      const pct = Math.round(clamp(toFiniteNumber(c?.value, 0), 0, 1) * 100);
      mainUpside = `It increases ${c.label} to around ${pct}%.`;
    }

    let mainRisk = "The main risk is that the path stays too close to baseline to matter.";
    const negativeImpact = stakeholderImpacts.find((item) => toFiniteNumber(item?.impact, 0) < -0.05);
    if (negativeImpact) {
      const pct = Math.round(Math.abs(toFiniteNumber(negativeImpact?.impact, 0)) * 100);
      mainRisk = `The main risk is negative pressure on ${negativeImpact.name} of about ${pct}%.`;
    } else if (keyVariableStates.length > 0 && toFiniteNumber(keyVariableStates[0]?.value, 0) < 0.5) {
      const c = keyVariableStates[0];
      const pct = Math.round(clamp(toFiniteNumber(c?.value, 0), 0, 1) * 100);
      mainRisk = `The main risk is ${c.label} sliding down to around ${pct}%.`;
    }

    let signal = "Watch for stable conditions to persist.";
    if (keyVariableStates.length > 0) {
      const c = keyVariableStates[0];
      const pct = Math.round(clamp(toFiniteNumber(c?.value, 0), 0, 1) * 100);
      const direction = toFiniteNumber(c?.value, 0) >= 0.5 ? "rising" : "falling";
      const intensity =
        Math.abs(toFiniteNumber(c?.value, 0) - 0.5) > 0.25 ? "sharply" : "gradually";
      signal = `Watch ${c.label} ${intensity} ${direction} toward ${pct}%`;
    } else if (stakeholderImpacts.length > 0) {
      const s = stakeholderImpacts[0];
      const pct = Math.round(Math.abs(toFiniteNumber(s?.impact, 0)) * 100);
      const direction = toFiniteNumber(s?.impact, 0) >= 0 ? "improving" : "worsening";
      signal = `Watch ${s.name} impact ${direction} by about ${pct}%`;
    } else if (causalSteps.length > 0) {
      signal = `Watch the execution of ${causalSteps[0]?.action || "the first step"}`;
    }

    let action = "Act by tightening the current operating plan.";
    if (causalSteps.length > 0) {
      const first = causalSteps[0]?.action || "the first step";
      if (causalSteps.length > 1) {
        const last = causalSteps[causalSteps.length - 1]?.action || first;
        action = `Act now by prioritizing ${first} so the path can move toward ${last}`;
      } else {
        action = `Act now by prioritizing ${first}`;
      }
    } else if (keyVariableStates.length > 0) {
      action = `Act by directly improving ${keyVariableStates[0]?.label || "the key variable"}`;
    }

    let sentiment = "neutral";
    if (toFiniteNumber(p.utility_score, 0) > 0.15) sentiment = "positive";
    else if (toFiniteNumber(p.utility_score, 0) < -0.15) sentiment = "negative";

    return {
      title,
      probability_label: probabilityLabel,
      outcome,
      main_risk: mainRisk,
      main_upside: mainUpside,
      signal,
      action,
      sentiment,
    };
  }

  async compose() {
    const pathDescriptors = this.buildPathDescriptors();
    const prompt = this.buildPrompt(pathDescriptors);

    let raw = "[]";
    try {
      raw = (await callLLM(prompt, 0.4)) || "[]";
    } catch (e) {
      if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
      console.warn("[QueryAdapter] explainDominantFutures LLM call failed:", e.message);
    }

    const parsedNarratives = this.parseNarratives(raw);
    const normalizedNarratives = asArray(parsedNarratives).map((item) =>
      this.sanitizeNarrativeItem(item)
    );

    const results = [];

    for (let i = 0; i < this.dominantPaths.length; i += 1) {
      const profile = pathDescriptors[i] || {
        index: i + 1,
        probability_percent: 0,
        utility_score: 0,
        causal_steps: [],
        key_variable_states: [],
        stakeholder_impacts: [],
      };

      const narrative = normalizedNarratives[i] || {};
      const fallback = this.buildFallbackNarrative(profile);

      const title = await this.guard.chooseUnique(
        "title",
        [narrative.title, fallback.title],
        () => fallback.title
      );

      const signalCandidates = [
        narrative.signal,
        narrative.watch_signal,
        narrative.observable_signal,
        narrative.observation_signal,
        fallback.signal,
        ...this.buildSignalCandidates(profile),
      ];

      const actionCandidates = [
        narrative.action,
        narrative.recommended_action,
        narrative.action_you_can_take_now,
        narrative.next_step,
        fallback.action,
        ...this.buildActionCandidates(profile),
      ];

      const signal = await this.guard.chooseUnique(
        "signal",
        signalCandidates,
        () => fallback.signal
      );

      let action = await this.guard.chooseUnique(
        "action",
        actionCandidates,
        () => fallback.action
      );

      if (normalizeTextKey(signal) === normalizeTextKey(action)) {
        const extraActionCandidates = this.buildActionCandidates(profile).filter(
          (candidate) => normalizeTextKey(candidate) !== normalizeTextKey(signal)
        );

        action = await this.guard.chooseUnique(
          "action",
          extraActionCandidates.length > 0
            ? extraActionCandidates
            : [`${fallback.action} — ${profile.key_variable_states?.[0]?.label || "next step"}`],
          () => `${fallback.action} — ${profile.key_variable_states?.[0]?.label || "next step"}`
        );
      }

      const probabilityLabel =
        narrative.probability_label || fallback.probability_label;
      const outcome = narrative.outcome || fallback.outcome;
      const mainRisk = narrative.main_risk || fallback.main_risk;
      const mainUpside = narrative.main_upside || fallback.main_upside;

      const sentimentRaw = String(narrative.sentiment || "").toLowerCase();
      const sentiment = ["positive", "negative", "neutral"].includes(sentimentRaw)
        ? sentimentRaw
        : fallback.sentiment;

      results.push({
        index: profile.index,
        probability_percent: profile.probability_percent,
        utility_score: profile.utility_score,
        causal_chain: asArray(profile.causal_steps).map((op) => ({
          operator_id: op.action,
          operator_label: op.action,
          probability_percent: op.probability,
        })),
        stakeholder_impacts: asArray(profile.stakeholder_impacts).map((item) => ({
          stakeholder_id: item.name,
          stakeholder_label: item.name,
          impact: item.impact,
        })),
        title,
        probability_label: probabilityLabel,
        outcome,
        main_risk: mainRisk,
        main_upside: mainUpside,
        signal,
        action,
        sentiment,
      });
    }

    return results;
  }
}

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
    variable_labels: additions.variable_labels || {},
    operator_labels: additions.operator_labels || {},
    stakeholder_labels: additions.stakeholder_labels || {},
    decision_summary: additions.decision_summary || "",
  };

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
  const existingOpNames = Object.keys(baseOntology.operators || {});
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
    if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
    console.warn("[QueryAdapter] generateDecisionSpace LLM call failed:", e.message);
  }

  const additions = parseJsonObjectFromText(raw, {});

  if (additions.variables && typeof additions.variables === "object") {
    for (const [key, def] of Object.entries(additions.variables)) {
      if (typeof def === "object" && def !== null) {
        def.min = toFiniteNumber(def.min, 0.0);
        def.max = toFiniteNumber(def.max, 1.0);
        def.defaultValue = clamp(
          toFiniteNumber(def.defaultValue, 0.5),
          def.min,
          def.max
        );
      }
    }
  }

  return mergeOntologies(baseOntology, additions);
}

export function extractDominantPaths(tree, rootId, topN = 3) {
  const nodesById = new Map((asArray(tree?.nodes)).map((n) => [n.id, n]));
  const edgesByFrom = new Map();

  for (const edge of asArray(tree?.edges)) {
    if (!edgesByFrom.has(edge.from)) edgesByFrom.set(edge.from, []);
    edgesByFrom.get(edge.from).push(edge);
  }

  const allPaths = [];

  function dfs(nodeId, pathOps, cumulativeProb, accumulatedExpectedUtility) {
    const node = nodesById.get(nodeId);
    if (!node) return;

    const nodeUtility = toFiniteNumber(node.utility_scalar, 0);
    const currentExpectedUtility =
      accumulatedExpectedUtility + cumulativeProb * nodeUtility;

    const outEdges = edgesByFrom.get(nodeId) || [];
    if (outEdges.length === 0) {
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

  allPaths.sort((a, b) => b.score - a.score);
  let topPaths = allPaths.slice(0, topN);

  const sumProb = topPaths.reduce((sum, p) => sum + toFiniteNumber(p.cumulativeProb, 0), 0.0);
  if (sumProb > 0) {
    topPaths = topPaths.map((p) => ({
      ...p,
      cumulativeProb: p.cumulativeProb / sumProb,
    }));
  }

  topPaths.sort((a, b) => b.cumulativeProb - a.cumulativeProb);

  return topPaths;
}

export async function explainDominantFutures(decision, dominantPaths, decisionSpace) {
  if (!Array.isArray(dominantPaths) || dominantPaths.length === 0) {
    return [];
  }

  const composer = new FutureNarrativeComposer(decision, dominantPaths, decisionSpace);
  return composer.compose();
}