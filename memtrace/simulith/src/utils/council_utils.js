import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getUserStateFromDB, saveUserStateToDB } from '../db/agent_memory.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

const cfg = DEFAULT_CONFIG.SIMULATION;

const DEFAULT_STATE = {
  settings: {
    branchCount: cfg.branchCount,
    personaCount: cfg.personaCount,
    weights: { ...cfg.weights },
    contradictionSensitivity: 1.0
  },
  personas: [],
  customPersonas: [],
  runs: [],
  jobs: [],
  outcomeStats: {
    totalRuns: 0,
    positiveOutcomes: 0,
    negativeOutcomes: 0,
    byBranch: {},
    byDomain: {}
  },
  clusterVersion: 1
};

import { MEMTRACE_DOMAINS } from '../data/manifest.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Removed filesystem ensureDir

export async function loadState(uuid) {
  if (!uuid) return clone(DEFAULT_STATE);
  try {
    const dbState = await getUserStateFromDB(uuid);
    return {
      ...clone(DEFAULT_STATE),
      ...(dbState || {}),
      settings: { 
        ...clone(DEFAULT_STATE.settings), 
        ...(dbState?.settings || {}), 
        weights: { ...clone(DEFAULT_STATE.settings.weights), ...((dbState?.settings || {}).weights || {}) } 
      },
      outcomeStats: {
        ...clone(DEFAULT_STATE.outcomeStats),
        ...(dbState?.outcomeStats || {}),
        byBranch: { ...clone(DEFAULT_STATE.outcomeStats.byBranch), ...((dbState?.outcomeStats || {}).byBranch || {}) },
        byDomain: { ...clone(DEFAULT_STATE.outcomeStats.byDomain), ...((dbState?.outcomeStats || {}).byDomain || {}) }
      }
    };
  } catch (err) {
    console.error(`Failed to load state from DB for uuid ${uuid}:`, err);
    return clone(DEFAULT_STATE);
  }
}

export async function saveState(uuid, state) {
  if (!uuid) return;
  await saveUserStateToDB(uuid, state);
}

export function defaultPersonasForDomain(domain = 'general', count = 4) {
  const domainKey = domain.toUpperCase();
  const bank = MEMTRACE_DOMAINS[domainKey] || MEMTRACE_DOMAINS.BUSINESS; // fallback
  const personas = [];
  for (let i = 0; i < count; i += 1) {
    const seed = bank[i % bank.length];
    personas.push({
      id: randomUUID(),
      name: seed.name,
      lens: seed.backstory || seed.lens || 'Evaluates critically',
      riskBias: seed.riskBias,
      evidenceDemand: seed.evidenceDemand,
      clarityNeed: seed.clarityNeed,
      noveltySeek: seed.noveltySeek,
      cluster: clusterFromPersona(seed),
      note: seed.backstory || seed.lens || 'Analyzes evidence'
    });
  }
  return personas;
}

export function clusterFromPersona(persona) {
  const thr = DEFAULT_CONFIG.SIMULATION.thresholds;
  const risk = Number(persona.riskBias ?? 0.5);
  const evidence = Number(persona.evidenceDemand ?? 0.5);
  if (risk >= thr.skepticRisk || evidence >= 0.8) return 'skeptical';
  if (risk <= thr.expansiveRisk && evidence <= 0.55) return 'expansive';
  return 'balanced';
}

export function recenterPersona(persona, patch = {}) {
  const next = {
    ...persona,
    ...patch
  };
  next.riskBias = clamp01(next.riskBias ?? persona.riskBias ?? 0.5);
  next.evidenceDemand = clamp01(next.evidenceDemand ?? persona.evidenceDemand ?? 0.5);
  next.clarityNeed = clamp01(next.clarityNeed ?? persona.clarityNeed ?? 0.5);
  next.noveltySeek = clamp01(next.noveltySeek ?? persona.noveltySeek ?? 0.5);
  next.cluster = clusterFromPersona(next);
  next.note = next.lens || persona.note || persona.name;
  return next;
}

export function reclusterPersonas(personas, outcomeStats = DEFAULT_STATE.outcomeStats) {
  const dcfg = DEFAULT_CONFIG.SIMULATION.drift;
  const domainSuccessRatio = (outcomeStats.positiveOutcomes + 1) / (outcomeStats.totalRuns + 2);
  
  return personas.map(persona => {
    const next = { ...persona };
    const wins = persona.wins || 0;
    const losses = persona.losses || 0;
    const total = wins + losses;
    const reliability = (wins + 1) / (total + 2);

    // Proprietary Trait Drift: Personas "learn" from their correctness
    if (total > 0 && reliability < dcfg.fragmentationThreshold) {
      // Re-center toward "balanced" if reliability is low
      next.riskBias = (next.riskBias ?? 0.5) * 0.9 + 0.05;
      next.evidenceDemand = (next.evidenceDemand ?? 0.5) * 0.9 + 0.05;
    } else if (total > 0 && reliability > dcfg.sharpeningThreshold) {
      // Sharpen their lens if they are consistently right
      if (next.cluster === 'skeptical') next.riskBias = clamp01((next.riskBias ?? 0.5) + 0.05);
      if (next.cluster === 'expansive') next.noveltySeek = clamp01((next.noveltySeek ?? 0.5) + 0.05);
    }

    // Global market drift: adjust all personas slightly based on overall domain success
    const marketBias = domainSuccessRatio > 0.55 ? -dcfg.marketDriftRate : dcfg.marketDriftRate;
    next.riskBias = clamp01((next.riskBias ?? 0.5) + marketBias);

    next.reliability = Math.round(reliability * 100) / 100;
    next.cluster = clusterFromPersona(next);
    return next;
  });
}

export async function recordOutcome(state, run, outcome) {
  const updated = { ...state };
  const isPositive = outcome && (outcome.success === true || outcome.label === 'success');
  const domain = run?.scenario?.domain || 'general';

  if (!updated.settings) updated.settings = getDefaultSettings();
  if (!updated.settings.weights) updated.settings.weights = { ...DEFAULT_CONFIG.SIMULATION.weights };
  const w = updated.settings.weights;
  const clampWeight = (v) => Math.max(0.1, Math.min(3.0, v));

  if (!isPositive) {
    w.risk = clampWeight((w.risk || 1.0) + 0.05);
    w.contradiction = clampWeight((w.contradiction || 1.0) + 0.05);
    w.evidence = clampWeight((w.evidence || 1.0) - 0.02);
  } else {
    w.risk = clampWeight((w.risk || 1.0) - 0.02);
  }

  updated.outcomeStats.totalRuns += 1;
  if (isPositive) updated.outcomeStats.positiveOutcomes += 1;
  else updated.outcomeStats.negativeOutcomes += 1;

  // Domain Stats
  if (!updated.outcomeStats.byDomain[domain]) {
    updated.outcomeStats.byDomain[domain] = { wins: 0, losses: 0 };
  }
  if (isPositive) updated.outcomeStats.byDomain[domain].wins += 1;
  else updated.outcomeStats.byDomain[domain].losses += 1;

  const branchId = outcome?.branchId || run?.recommendation?.branchId || 'unknown';
  if (!updated.outcomeStats.byBranch[branchId]) {
    updated.outcomeStats.byBranch[branchId] = { wins: 0, losses: 0 };
  }
  if (isPositive) updated.outcomeStats.byBranch[branchId].wins += 1;
  else updated.outcomeStats.byBranch[branchId].losses += 1;

  // Update Personas who participated
  if (run?.population?.personas) {
    updated.personas = updated.personas.map(p => {
      const participant = run.population.personas.find(rp => rp.id === p.id);
      if (!participant) return p;

      const next = { ...p };
      const stance = participant.reactions?.find(r => r.branchId === branchId)?.stance || 'wait';
      
      if ((isPositive && stance === 'support') || (!isPositive && stance === 'push back')) {
        next.wins = (next.wins || 0) + 1;
      } else if ((isPositive && stance === 'push back') || (!isPositive && stance === 'support')) {
        next.losses = (next.losses || 0) + 1;
      }
      return next;
    });
  }

  updated.runs.push({
    id: run?.id || randomUUID(),
    domain,
    question: run?.scenario?.question || outcome?.question || '',
    branchId,
    outcome,
    recordedAt: new Date().toISOString()
  });

  const { objectiveRecluster } = await import('../agents/recluster.js');
  updated.personas = objectiveRecluster(updated.personas, updated.outcomeStats);
  updated.clusterVersion += 1;
  return updated;
}

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function getDefaultSettings() {
  return clone(DEFAULT_STATE.settings);
}
