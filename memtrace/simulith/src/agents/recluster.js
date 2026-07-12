import { clamp01 } from '../utils/council_utils.js';

/* ==================================================================
   simulith/src/recluster.js
   Between-tick population evolution.

   Three mechanisms:
   1. Fragmentation — spawn a trait-variant when a cluster keeps losing
   2. Collapse       — prune near-identical personas to reduce redundancy
   3. Trait Drift   — winners reinforce their traits; losers drift toward
                      centre so they can be reshaped by future evidence

   noveltySeek / clarityNeed are re-derived from updated traits so that
   the rest of the engine always sees internally consistent persona objects.
   ================================================================== */

// Minimum trait distance below which two personas are considered duplicates
const COLLAPSE_THRESHOLD  = 0.12;
// Average losses per persona in a cluster before fragmentation triggers
const FRAGMENT_LOSS_FLOOR = 2;
// How much a winner shifts their dominant trait per recluster cycle
const DRIFT_STEP          = 0.05;

/**
 * @param {object[]} personas     - current population
 * @param {object}   outcomeStats - optional extra signal (unused internally, kept for API compat)
 * @returns {object[]} evolved population (new array, original untouched)
 */
export function objectiveRecluster(personas, outcomeStats = {}) {
  let next = personas.map(p => ({ ...p }));

  next = _applyTraitDrift(next);
  next = _fragmentWeakClusters(next);
  next = _collapseNearDuplicates(next);

  return next;
}

// ── 1. Trait Drift ──────────────────────────────────────────────────

/**
 * Winning personas (wins > losses × 1.5) shift their decisive trait slightly
 * toward the extreme that made them win. Losing personas drift toward centre (0.5).
 * noveltySeek and clarityNeed are re-derived afterwards so the persona stays
 * internally consistent.
 */
function _applyTraitDrift(personas) {
  return personas.map(p => {
    const wins   = p.wins   || 0;
    const losses = p.losses || 0;

    if (wins + losses < 2) return p; // not enough history yet

    const updated = { ...p };

    if (wins > losses * 1.5) {
      // Winner: reinforce the trait that characterises this cluster
      if (p.cluster === 'skeptical') {
        // Skeptical winners are cautious — reinforce high riskBias + high evidenceDemand
        updated.riskBias       = clamp01(p.riskBias       + DRIFT_STEP);
        updated.evidenceDemand = clamp01(p.evidenceDemand + DRIFT_STEP);
      } else if (p.cluster === 'expansive') {
        // Expansive winners are bold — reinforce low riskBias + low evidenceDemand
        updated.riskBias       = clamp01(p.riskBias       - DRIFT_STEP);
        updated.evidenceDemand = clamp01(p.evidenceDemand - DRIFT_STEP);
      } else {
        // Balanced winners: nudge toward whichever extreme they lean
        const riskDir = p.riskBias > 0.5 ? 1 : -1;
        updated.riskBias = clamp01(p.riskBias + riskDir * DRIFT_STEP * 0.5);
      }
    } else if (losses > wins * 1.5) {
      // Loser: drift toward centre so they can be reshaped
      updated.riskBias       = clamp01(p.riskBias       + (0.5 - p.riskBias)       * 0.15);
      updated.evidenceDemand = clamp01(p.evidenceDemand + (0.5 - p.evidenceDemand) * 0.15);
    }

    // Re-derive noveltySeek and clarityNeed from updated traits (same formulas as simulator.js)
    const rb = updated.riskBias;
    const ed = updated.evidenceDemand;
    updated.noveltySeek = clamp01((1 - rb) * 0.6 + (1 - ed) * 0.4);

    const reasoningStyleBonus = {
      'data-driven': 0.15, 'systemic': 0.10, 'historical': 0.05,
      'ethical': 0.05,     'financial': 0.10, 'operational': 0.08,
      'contrarian': -0.10, 'intuitive': -0.12
    }[p.reasoningStyle] ?? 0;
    updated.clarityNeed = clamp01(ed * 0.75 + (1 - updated.noveltySeek) * 0.25 + reasoningStyleBonus);

    // Re-assign cluster from updated traits
    updated.cluster = _pickCluster(updated);

    return updated;
  });
}

// ── 2. Fragmentation ────────────────────────────────────────────────

/**
 * If a cluster's average losses exceed the floor, spawn a trait-variant
 * with jittered traits to explore new solution space.
 */
function _fragmentWeakClusters(personas) {
  const clusters = ['skeptical', 'expansive', 'balanced'];
  const additions = [];

  for (const cluster of clusters) {
    const members    = personas.filter(p => p.cluster === cluster);
    if (members.length === 0) continue;
    const avgLosses  = members.reduce((acc, p) => acc + (p.losses || 0), 0) / members.length;

    if (avgLosses > FRAGMENT_LOSS_FLOOR) {
      // Pick the highest-performing member as the template
      const template = [...members].sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];
      const jitter   = () => (Math.random() - 0.5) * 0.3;

      const rb  = clamp01(template.riskBias       + jitter());
      const ed  = clamp01(template.evidenceDemand + jitter());
      const ns  = clamp01((1 - rb) * 0.6 + (1 - ed) * 0.4);
      const rsb = {
        'data-driven': 0.15, 'systemic': 0.10, 'historical': 0.05,
        'ethical': 0.05,     'financial': 0.10, 'operational': 0.08,
        'contrarian': -0.10, 'intuitive': -0.12
      }[template.reasoningStyle] ?? 0;
      const cn = clamp01(ed * 0.75 + (1 - ns) * 0.25 + rsb);

      const variant = {
        ...template,
        id:            `${cluster}-variant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name:          `${template.name} Variant`,
        riskBias:       rb,
        evidenceDemand: ed,
        noveltySeek:    ns,
        clarityNeed:    cn,
        reliability:    0.5,
        wins:           0,
        losses:         0,
        note:           `Fragmented from ${cluster} (avg losses: ${avgLosses.toFixed(1)}).`
      };
      variant.cluster = _pickCluster(variant);
      additions.push(variant);
    }
  }

  return [...personas, ...additions];
}

// ── 3. Collapse Near-Duplicates ─────────────────────────────────────

/**
 * If two personas share a cluster and are within COLLAPSE_THRESHOLD on all
 * four key traits, remove the one with lower reliability.
 */
function _collapseNearDuplicates(personas) {
  const toRemove = new Set();

  for (let i = 0; i < personas.length; i++) {
    if (toRemove.has(personas[i].id)) continue;
    for (let j = i + 1; j < personas.length; j++) {
      if (toRemove.has(personas[j].id)) continue;
      const p1 = personas[i];
      const p2 = personas[j];
      if (p1.cluster !== p2.cluster) continue;

      const traitDiff =
        Math.abs(p1.riskBias       - p2.riskBias)       +
        Math.abs(p1.evidenceDemand - p2.evidenceDemand) +
        Math.abs((p1.noveltySeek || 0.5) - (p2.noveltySeek || 0.5)) +
        Math.abs((p1.clarityNeed || 0.5) - (p2.clarityNeed || 0.5));

      if (traitDiff < COLLAPSE_THRESHOLD) {
        const weaker = (p1.reliability ?? 0.5) < (p2.reliability ?? 0.5) ? p1.id : p2.id;
        toRemove.add(weaker);
      }
    }
  }

  return personas.filter(p => !toRemove.has(p.id));
}

// ── Cluster Assignment ──────────────────────────────────────────────

function _pickCluster(p) {
  if ((p.riskBias ?? 0.5) >= 0.75 || (p.evidenceDemand ?? 0.5) >= 0.80) return 'skeptical';
  if ((p.noveltySeek ?? 0.5) >= 0.70 && (p.riskBias ?? 0.5) <= 0.45)   return 'expansive';
  return 'balanced';
}
