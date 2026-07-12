/**
 * simulith/src/utils/tree_runtime_utils.js:
 * Shared runtime helpers for the Tree Mode engine.
 * These functions intentionally avoid application-specific assumptions.
 */

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