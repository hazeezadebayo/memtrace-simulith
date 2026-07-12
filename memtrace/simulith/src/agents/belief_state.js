/* ==================================================================
   simulith/src/belief_state.js
   Per-agent belief management and the heuristic nudge formula.

   BeliefState schema:
     positions  : { "topic_slug": float  }  // -1.0 (strongly against) to +1.0 (strongly for)
     confidence : { "topic_slug": float  }  // 0.1 to 0.99
     trust      : { "agent_id":   float  }  // 0.1 to 0.95 (how much this agent trusts another)
   ================================================================== */

import { clamp01 } from '../utils/council_utils.js';
import { callLLM } from '../llm/ai.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Global base learning rate. Actual per-agent rate is scaled by persona traits.
const BASE_LEARNING_RATE = 0.12;

// ─── Factory ───────────────────────────────────────────────────────

/**
 * Create a belief state for a persona.
 * Initial positions and confidence are seeded from persona traits so that
 * a risk-tolerant persona starts more opinionated and a cautious one more neutral.
 *
 * @param {string[]} initialTopics
 * @param {object}  initialPositions - pre-seeded { slug: float } overrides
 * @param {object}  persona          - optional persona object for trait-based seeding
 */
export function createBeliefState(initialTopics = [], initialPositions = {}, persona = null) {
  const positions = {};
  const confidence = {};
  const trust = {};

  // riskBias low → persona is a risk-taker → stronger initial opinions
  // evidenceDemand high → persona needs evidence → starts near neutral
  const rb = persona?.riskBias ?? 0.5;
  const ed = persona?.evidenceDemand ?? 0.5;
  const opinionStrength = (1 - rb) * 0.6 + (1 - ed) * 0.4; // 0–1, higher = more polarised
  const baseConfidence = 0.30 + opinionStrength * 0.30;     // 0.30–0.60

  for (const topic of initialTopics) {
    const slug = slugify(topic);
    const override = initialPositions[slug];
    if (override !== undefined) {
      positions[slug] = clamp(override, -1, 1);
    } else {
      // Scale initial spread by opinionStrength
      const spread = 0.2 + opinionStrength * 0.5;
      positions[slug] = clamp((Math.random() * 2 - 1) * spread, -1, 1);
    }
    confidence[slug] = clamp(baseConfidence + Math.random() * 0.15, 0.1, 0.99);
  }

  return { positions, confidence, trust };
}

// ─── Nudge Formula ─────────────────────────────────────────────────

/**
 * Update an agent's beliefs after observing a set of posts this tick.
 *
 * @param {object} beliefs       - current BeliefState
 * @param {Array}  observations  - list of { authorId, authorFaction, stances, likeCount, type, agrees }
 *   stances: { "topic_slug": float } – the author's expressed stance per topic
 *   type:    'post' | 'reply' | 'like' | 'quote' | 'comment'
 * @param {object} opts - {
 *   seenArguments: Set<string>,
 *   persona: object,         // current agent's persona for per-agent learning rate
 *   agentFaction: string,    // current agent's faction for echo chamber detection
 * }
 * @returns {object} updated beliefs (clone — does NOT mutate)
 */
export function nudgeBeliefs(beliefs, observations, opts = {}) {
  const seenArgs = opts.seenArguments || new Set();
  const persona = opts.persona || null;
  const agentFaction = opts.agentFaction || null;
  const next = deepCloneBeliefs(beliefs);

  // Per-agent effective learning rate:
  // High noveltySeek → faster belief adoption. High clarityNeed → slower (needs more evidence).
  const noveltySeek = persona?.noveltySeek ?? 0.5;
  const clarityNeed = persona?.clarityNeed ?? 0.5;
  const effectiveLR = BASE_LEARNING_RATE * (0.5 + noveltySeek * 0.8) * (1.2 - clarityNeed * 0.4);

  // Track how many observations come from the same faction (echo chamber counter)
  const sameFactionCount = {};

  for (const obs of observations) {
    // ── Echo chamber damping ──────────────────────────────────────
    // If the author is in the same faction as the observer, their signal is worth
    // progressively less — diminishing returns on hearing the same tribe speak.
    const isSameFaction = agentFaction && obs.authorFaction && agentFaction === obs.authorFaction;
    if (isSameFaction) {
      sameFactionCount[obs.authorFaction] = (sameFactionCount[obs.authorFaction] || 0) + 1;
    }
    const echoCount = isSameFaction ? sameFactionCount[obs.authorFaction] : 1;
    const echoDamping = isSameFaction
      ? Math.min(0.7, 1 / echoCount)  // cap trust at 0.7 within-faction; further damping per repeat
      : 1.0;

    const rawTrust = next.trust[obs.authorId] ?? 0.5;
    const authorTrust = clamp(rawTrust * echoDamping, 0.1, 0.95);
    const socialBoost = 1.0 + 0.1 * Math.min(5, obs.likeCount || 0);
    const noveltyMult = seenArgs.has(obs.argumentKey) ? 0.35 : 1.0;

    const postWeight = authorTrust * socialBoost * noveltyMult;

    for (const [topic, authorStance] of Object.entries(obs.stances || {})) {
      if (!Object.prototype.hasOwnProperty.call(next.positions, topic)) {
        next.positions[topic] = 0;
        next.confidence[topic] = 0.35;
      }
      const currentPos = next.positions[topic];
      const currentConf = next.confidence[topic] ?? 0.4;
      // Resistance increases with both confidence AND clarityNeed (stubborn + evidence-demanding agents resist change)
      const resistance = 1 + 3 * currentConf + 2 * clarityNeed;

      const delta = (authorStance - currentPos) * postWeight * effectiveLR / resistance;
      next.positions[topic] = clamp(currentPos + delta, -1, 1);

      // Confidence dynamics:
      // - Opposition erodes confidence slightly
      // - Agreement within different factions (cross-faction validation) boosts confidence more
      if (obs.agrees === false) {
        const erosion = isSameFaction ? 0.02 : 0.05; // cross-faction disagreement hurts more
        next.confidence[topic] = clamp(currentConf - erosion, 0.1, 0.99);
      } else if (obs.agrees === true && !isSameFaction) {
        // Cross-faction agreement is strong evidence — boost confidence
        next.confidence[topic] = clamp(currentConf + 0.03, 0.1, 0.99);
      }
    }

    // ── Trust update ─────────────────────────────────────────────
    // like/follow → strongest trust boost
    // reply/quote → slight positive engagement signal
    // cross-faction disagreement → erodes trust most
    if (obs.type === 'follow' || obs.type === 'like') {
      next.trust[obs.authorId] = clamp(rawTrust + 0.08, 0.1, 0.95);
    } else if (obs.type === 'reply' || obs.type === 'quote') {
      next.trust[obs.authorId] = clamp(rawTrust + 0.02, 0.1, 0.95);
    } else if (obs.agrees === false) {
      const erosion = isSameFaction ? 0.02 : 0.05;
      next.trust[obs.authorId] = clamp(rawTrust - erosion, 0.1, 0.95);
    }

    if (obs.argumentKey) seenArgs.add(obs.argumentKey);
  }

  return next;
}

/**
 * Apply confidence boost when the agent's own post receives validation.
 */
export function applyOwnPostFeedback(beliefs, topics, likeCount, disagreements) {
  const next = deepCloneBeliefs(beliefs);
  for (const topic of topics) {
    const curr = next.confidence[topic] ?? 0.45;
    const boost = likeCount > 0 ? 0.04 : 0;
    const dip = disagreements > 0 ? 0.04 * Math.min(3, disagreements) : 0;
    next.confidence[topic] = clamp(curr + boost - dip, 0.1, 0.99);
  }
  return next;
}

// ─── Cascade Mechanics ─────────────────────────────────────────────

/**
 * Simulates both negative (panic) and positive (enthusiasm) cascade tipping points.
 *
 * Negative cascade: if >= 40% of agents are <= -0.5 on a topic, reactive/high-riskBias agents
 * collapse to -0.9 (panic mode, high-confidence lock-in).
 *
 * Positive cascade: if >= 40% of agents are >= +0.5 on a topic, expansive/low-riskBias agents
 * surge to +0.9 (viral enthusiasm, high-confidence lock-in).
 */
export function applyCascadeTippingPoints(agents) {
  if (!agents || agents.length === 0) return;

  // Collect all topics present across the population
  const topics = new Set();
  for (const agent of agents) {
    if (agent.beliefs?.positions) {
      for (const t of Object.keys(agent.beliefs.positions)) topics.add(t);
    }
  }

  const total = agents.length;

  for (const topic of topics) {
    let negCount = 0;
    let posCount = 0;
    for (const agent of agents) {
      const pos = agent.beliefs?.positions?.[topic] ?? 0;
      if (pos <= -0.5) negCount++;
      if (pos >= 0.5) posCount++;
    }

    const negRatio = negCount / total;
    const posRatio = posCount / total;

    for (const agent of agents) {
      const pos = agent.beliefs?.positions?.[topic] ?? 0;

      // ── Negative cascade ──
      if (negRatio >= 0.40 && pos > -0.5) {
        const isReactive = _isReactive(agent);
        if (isReactive) {
          _setCascadePosition(agent, topic, pos, -0.9, '[CASCADING PANIC]');
        }
      }

      // ── Positive cascade ──
      if (posRatio >= 0.40 && pos < 0.5) {
        const isExpansive = _isExpansive(agent);
        if (isExpansive) {
          _setCascadePosition(agent, topic, pos, +0.9, '[VIRAL ENTHUSIASM]');
        }
      }
    }
  }
}

function _isReactive(agent) {
  return (
    String(agent.cluster || '').toLowerCase().includes('reactive') ||
    String(agent.lens || '').toLowerCase().includes('reactive') ||
    (agent.riskBias !== undefined && agent.riskBias >= 0.75)
  );
}

function _isExpansive(agent) {
  return (
    String(agent.cluster || '').toLowerCase().includes('expansive') ||
    (agent.noveltySeek !== undefined && agent.noveltySeek >= 0.7 && (agent.riskBias ?? 1) <= 0.45)
  );
}

function _setCascadePosition(agent, topic, fromPos, toPos, note) {
  if (!agent.beliefs) agent.beliefs = { positions: {}, confidence: {}, trust: {} };
  if (!agent.beliefs.positions) agent.beliefs.positions = {};
  if (!agent.beliefs.confidence) agent.beliefs.confidence = {};
  agent.beliefs.positions[topic] = toPos;
  agent.beliefs.confidence[topic] = 0.99; // high lock-in
  if (!agent._lastShifts) agent._lastShifts = [];
  agent._lastShifts.push({
    topic,
    from: +fromPos.toFixed(2),
    to: toPos,
    delta: +(toPos - fromPos).toFixed(2),
    note
  });
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Compute the net drift between two belief snapshots (for reporting). */
export function beliefDelta(before, after) {
  const shifts = [];
  for (const topic of Object.keys(after.positions)) {
    const prev = before.positions[topic] ?? 0;
    const curr = after.positions[topic] ?? 0;
    const diff = curr - prev;
    if (Math.abs(diff) > 0.03) {
      shifts.push({ topic, from: +prev.toFixed(2), to: +curr.toFixed(2), delta: +diff.toFixed(2) });
    }
  }
  return shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Human-readable summary of belief state for prompt injection. */
export function summarizeBeliefs(beliefs, topics = null) {
  const relevant = topics
    ? Object.entries(beliefs.positions).filter(([t]) => topics.includes(t))
    : Object.entries(beliefs.positions);
  if (relevant.length === 0) return 'No strong prior views.';
  return relevant
    .map(([t, v]) => {
      const label = v > 0.3 ? 'supportive' : v < -0.3 ? 'skeptical' : 'neutral';
      return `${t.replace(/_/g, ' ')}: ${label} (${v > 0 ? '+' : ''}${v.toFixed(2)})`;
    })
    .join('; ');
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, '')  // preserve underscores — they are valid slug separators
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 32);
}

function deepCloneBeliefs(b) {
  return {
    positions: { ...b.positions },
    confidence: { ...b.confidence },
    trust: { ...b.trust }
  };
}

// ─── Dynamic Faction Tipping (LLM-assisted) ────────────────────────

/**
 * Uses the LLM to decide if a low-confidence agent should change faction.
 * Only fires for agents whose average confidence is below 0.55 or who are
 * highly volatile (random 15% chance for others to prevent stagnation).
 */
export async function evaluateDynamicFactionTipping(agents, graph, scenario) {
  if (!agents || agents.length === 0 || !graph?.nodes || graph.nodes.length <= 1) return;

  const nodesList = graph.nodes.map(n => n.id);
  const nodesSummary = graph.nodes.map(n => `- ${n.id} (${n.label})`).join('\n');

  for (const agent of agents) {
    const positions = agent.beliefs?.positions || {};
    const confidences = agent.beliefs?.confidence || {};

    const topics = Object.keys(confidences);
    if (topics.length === 0) continue;

    const avgConfidence = topics.reduce((sum, t) => sum + confidences[t], 0) / topics.length;
    if (avgConfidence > 0.55 && Math.random() > 0.15) continue;

    const beliefSummary = topics
      .map(t => `${t}: pos=${positions[t]?.toFixed(2)}, conf=${confidences[t]?.toFixed(2)}`)
      .join('; ');

    const prompt = `We are simulating a scenario: "${scenario?.question || ''}"
Facts: ${(scenario?.facts || []).join('; ')}

Agent "${agent.name}" (Current Faction: "${agent.faction}") backstory: "${agent.backstory}".
Current beliefs: ${beliefSummary}.
Available factions:
${nodesSummary}

Should this agent change their faction? Return JSON: {"changeFaction": true/false, "newFaction": "node_id", "rationale": "short reasoning"}.
Return JSON only.`;

    try {
      // callLLM takes (prompt, opts) — single unified signature
      const response = await callLLM(prompt, 0.5);

      const clean = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.changeFaction && parsed.newFaction && nodesList.includes(parsed.newFaction)) {
          console.log(`[Dynamic Tipping] ${agent.name}: ${agent.faction} → ${parsed.newFaction}. ${parsed.rationale}`);
          agent.faction = parsed.newFaction;
          agent.boundNodeId = parsed.newFaction;

          const shiftNote = ` (Aligned to ${parsed.newFaction}: ${parsed.rationale})`;
          if (agent.backstory && !agent.backstory.includes(shiftNote)) {
            agent.backstory += shiftNote;
          } else if (!agent.backstory) {
            agent.backstory = shiftNote;
          }

          if (!agent._lastShifts) agent._lastShifts = [];
          agent._lastShifts.push({
            topic: 'faction_alignment',
            from: 0,
            to: 1,
            delta: 1,
            note: `[FACTION SHIFT] → ${parsed.newFaction}. ${parsed.rationale}`
          });
        }
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
      console.warn(`[Dynamic Tipping] Failed for ${agent.name}:`, err.message);
    }
  }
}
