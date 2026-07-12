/* ==================================================================
   simulith/src/mesh.js
   Mesh Factory — spawns a fixed population of viewpoint agents.

   Important change:
     - Agents are no longer the nodes
     - Nodes live in the scenario graph
     - Agents observe, judge, and narrate that graph
   ================================================================== */

import { randomUUID } from 'node:crypto';
import { clusterFromPersona } from '../utils/council_utils.js';
import { createBeliefState, slugify } from './belief_state.js';
import { MEMTRACE_DOMAINS, PSEUDO_ARCHETYPES } from '../data/manifest.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { getEmbedding, cosineSimilarity } from '../../../extension/llm/embedding.js';

const ALL_PLATFORMS = Object.keys(DEFAULT_CONFIG.MEMTRACE?.tokenLimits || {}).filter(k => k !== 'default');
if (ALL_PLATFORMS.length === 0) {
  ALL_PLATFORMS.push('twitter', 'reddit', 'hn', 'discord', 'market', 'facebook');
}

// ─── Topic Extraction ──────────────────────────────────────────────

async function extractTopics(scenario, graph = null) {
  let topics = [];
  
  // 1. If a robust knowledge graph is provided, use its deterministic ontology nodes
  if (graph && graph.nodes && graph.nodes.length > 0) {
    // Prioritize concepts, events, and metrics over generic actors
    const prioritizedNodes = [...graph.nodes].sort((a, b) => {
      const isAHighPriority = ['concept', 'event', 'metric'].includes(a.type) ? 1 : 0;
      const isBHighPriority = ['concept', 'event', 'metric'].includes(b.type) ? 1 : 0;
      return isBHighPriority - isAHighPriority;
    });
    topics = prioritizedNodes.map(n => n.id).slice(0, 7);
  } else {
    // 2. Semantic Fallback: KeyBERT-style Xenova extraction
    const rawText = [scenario.question, ...(scenario.facts || [])].join(' ');
    const rawWords = rawText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4);

    // Deduplicate candidates
    const candidates = [...new Set(rawWords)];
    
    if (candidates.length > 0) {
      try {
        // Compute document embedding
        const docEmb = await getEmbedding(rawText, "xenova");
        if (!docEmb) throw new Error("Document embedding failed");

        // Compute candidate embeddings concurrently
        const candidateEmbs = await Promise.all(
          candidates.map(async (word) => {
            const emb = await getEmbedding(word, "xenova");
            return { word, emb };
          })
        );

        // Score candidates by cosine similarity to the document
        const scored = candidateEmbs
          .filter((c) => c.emb !== null)
          .map((c) => ({
            word: c.word,
            score: cosineSimilarity(docEmb, c.emb)
          }));

        topics = scored
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map(c => slugify(c.word));
      } catch (e) {
        if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
        console.warn("[Topic Extraction] Xenova fallback failed, using frequency...", e.message);
        const freq = {};
        for (const w of rawWords) freq[w] = (freq[w] || 0) + 1;
        topics = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([w]) => slugify(w));
      }
    }
  }

  // MUST always include core_premise to ensure we can evaluate stances on the scenario itself
  if (!topics.includes('core_premise')) {
    topics.unshift('core_premise');
  }

  return topics;
}

// ─── Graph-Aware Agent Ranking ─────────────────────────────────────

function scoreNodeForAgent(agent, node) {
  let score = 0.5;

  const evidenceHeavy = (agent.evidenceDemand ?? 0.5) > 0.82;
  const riskHeavy = (agent.riskBias ?? 0.5) > 0.82;
  const noveltyHeavy = (agent.noveltySeek ?? 0.5) > 0.82;
  const clarityHeavy = (agent.clarityNeed ?? 0.5) > 0.80;

  if (evidenceHeavy && ['metric', 'regulation', 'concept'].includes(node.type)) score += 0.16;
  if (riskHeavy && ['regulation', 'infrastructure', 'organization'].includes(node.type)) score += 0.12;
  if (noveltyHeavy && ['event', 'concept', 'resource'].includes(node.type)) score += 0.12;
  if (clarityHeavy && ['location', 'infrastructure', 'metric'].includes(node.type)) score += 0.10;

  if (agent.cluster === 'skeptical' && ['metric', 'regulation', 'event'].includes(node.type)) score += 0.08;
  if (agent.cluster === 'expansive' && ['concept', 'event', 'organization'].includes(node.type)) score += 0.08;
  if (agent.cluster === 'balanced' && ['person', 'organization', 'concept'].includes(node.type)) score += 0.05;

  return score;
}

function rankNodesForAgent(agent, nodes) {
  return [...nodes]
    .map((node) => ({ node, score: scoreNodeForAgent(agent, node) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.node);
}

function summarizeLocalNeighborhood(graph, nodeIds, limit = 4) {
  const seen = [];
  for (const nodeId of nodeIds) {
    const bucket = graph.adjacency.get(nodeId);
    if (!bucket) continue;
    for (const edge of bucket.all.slice(0, limit)) {
      seen.push({
        src: graph.nodeById.get(edge.src)?.label || edge.src,
        rel: edge.rel,
        dst: graph.nodeById.get(edge.dst)?.label || edge.dst,
      });
    }
  }
  return seen;
}

// ─── Mesh Generation ─────────────────────────────────────────────

/**
 * Generate a fixed-size mesh of viewpoint agents.
 *
 * Important:
 *   - agent count is independent of node count
 *   - graph nodes are the nouns in the simulation
 *   - agents are the interpreters of that graph
 *
 * @param {object} scenario - { question, facts, domain, audience }
 * @param {string} simId
 * @param {number} count - default 12, but 15 is a very good fixed size
 * @param {object|null} graph - output of buildScenarioGraph(...)
 * @returns {Array<object>}
 */
export async function generateMesh(scenario, simId, count = 15, graph = null, customPersonas = []) {
  const topics = await extractTopics(scenario, graph);
  scenario.topics = topics; // ensure it's available for belief nudges
  const agents = [];

  const domainKey = (scenario.domain || '').toUpperCase();
  const domainPool = MEMTRACE_DOMAINS[domainKey] || MEMTRACE_DOMAINS.BUSINESS;

  // Dynamically partition the pre-enriched pool using registry names to avoid hardcoded slicing
  const pseudoNames = new Set(PSEUDO_ARCHETYPES.map(p => p.name));
  const specificArchetypes = domainPool.filter(a => !pseudoNames.has(a.name));
  const pseudoArchetypes = domainPool.filter(a => pseudoNames.has(a.name));

  const getShuffled = (arr) => [...arr].sort(() => Math.random() - 0.5);
  let currentPseudos = getShuffled(pseudoArchetypes);
  let currentSpecifics = getShuffled(specificArchetypes);

  const pool = [];

  if (customPersonas && customPersonas.length > 0) {
    pool.push(...customPersonas.slice(0, count));
  }

  for (let i = pool.length; i < count; i++) {
    if (i % 10 === 0) {
      if (currentPseudos.length === 0) {
        currentPseudos = getShuffled(pseudoArchetypes);
      }
      pool.push(currentPseudos.pop());
    } else {
      if (currentSpecifics.length === 0) {
        currentSpecifics = getShuffled(specificArchetypes);
      }
      pool.push(currentSpecifics.pop());
    }
  }

  const platformRotation = _buildPlatformRotation(count);

  for (let i = 0; i < count; i++) {
    const archetype = pool[i];
    const n = i + 1;

    const name = `${archetype.name}_${n}`;

    const primaryPlatform = archetype.platform || platformRotation[i];
    const otherPlatforms = ALL_PLATFORMS.filter(p => p !== primaryPlatform);
    // Pull the cap from config; clamp between 1 and total available platforms
    const maxPlatforms = Math.min(
      DEFAULT_CONFIG.MEMTRACE?.maxPlatformsPerAgent ?? 3,
      ALL_PLATFORMS.length
    );
    // Each agent gets exactly maxPlatforms platforms
    const numAdditional = maxPlatforms - 1;
    const shuffledOthers = [...otherPlatforms].sort(() => 0.5 - Math.random());
    const assignedPlatforms = [primaryPlatform, ...shuffledOthers.slice(0, numAdditional)];

    const agent = {
      id: randomUUID(),
      simId,
      name,
      platform: primaryPlatform,
      platforms: assignedPlatforms,
      backstory: archetype.backstory,
      faction: archetype.faction || 'General',
      riskBias: _jitter(archetype.riskBias, 0.07),
      evidenceDemand: _jitter(archetype.evidenceDemand, 0.07),
      clarityNeed: _jitter(archetype.clarityNeed, 0.07),
      noveltySeek: _jitter(archetype.noveltySeek, 0.07),
      financialStake: _jitter(archetype.financialStake ?? 0.40, 0.05),
      memoryDecay: _jitter(archetype.memoryDecay ?? 0.10, 0.03),
      cluster: null,
      beliefs: createBeliefState(topics),
      topics,
      recentPostIds: [],
      seenArguments: new Set(),
      focusNodeIds: [],
      localNeighborhood: [],
    };

    agent.cluster = clusterFromPersona(agent);

    if (graph?.nodes?.length) {
      const ranked = rankNodesForAgent(agent, graph.nodes);
      agent.focusNodeIds = ranked.slice(0, Math.min(4, ranked.length)).map((n) => n.id);
      agent.localNeighborhood = summarizeLocalNeighborhood(graph, agent.focusNodeIds, 3);
    }

    agents.push(agent);
  }

  return agents;
}

// ─── System Prompt Builder ─────────────────────────────────────────

export function getDynamicPersonalityDescriptor(agent) {
  const cluster = agent.cluster;
  const isHighEvidence = (agent.evidenceDemand ?? 0.5) > 0.85;
  const isHighRiskAversion = (agent.riskBias ?? 0.5) > 0.85;
  const isHighNovelty = (agent.noveltySeek ?? 0.5) > 0.85;
  const isHighClarity = (agent.clarityNeed ?? 0.5) > 0.80;

  if (cluster === 'skeptical') {
    if (isHighEvidence && isHighRiskAversion) {
      return 'extremely cautious, highlighting downside risks and demanding clear proof before committing';
    }
    if (isHighEvidence) {
      return 'deeply analytical, asking for sources, verification, and empirical proof';
    }
    return 'naturally critical of hype, focusing on identifying potential failure modes and hidden costs';
  }

  if (cluster === 'expansive') {
    if (isHighNovelty) {
      return 'highly adventurous, looking for new angles and eager to experiment quickly';
    }
    return 'optimistic, action-oriented, and supportive of testing new ideas to build momentum';
  }

  if (isHighClarity) {
    return 'methodical, seeking logical structure and a staged, well-planned path forward';
  }

  return 'balanced, weighing upsides against downside risks, and favoring pragmatic compromise';
}

/**
 * Build a persona-specific system prompt for an agent.
 * The agent should react only to the nodes/edges in its local graph view.
 */
export function buildAgentSystemPrompt(agent, scenario, beliefs, graph = null) {
  const pl = DEFAULT_CONFIG.promptLimits;
  const platformVoice = {
    twitter:
      'You post short, punchy takes (under 200 characters). Opinionated. No hedging. Use #hashtags when necessary.',
    reddit:
      'You write considered, multi-sentence replies. You cite reasoning. Respectful but direct.',
    hn:
      'You write technically precise comments. You avoid hype. You acknowledge trade-offs.',
    discord:
      'You write conversationally. Community-aware. Sometimes add emoji for tone.',
    market:
      'You write in terms of probability, position sizing, and risk-adjusted return.',
    facebook:
      'You write in longer, emotional paragraphs (under 300 characters). Share personal anecdotes. Use emojis and #hashtags when necessary.',
  };

  const posStr = beliefs?.positions
    ? Object.entries(beliefs.positions)
        .map(
          ([t, v]) =>
            `${t}: ${v > 0.2 ? 'for' : v < -0.2 ? 'against' : 'neutral'}`
        )
        .join(', ')
        .slice(0, pl.beliefs)
    : 'No strong priors.';

  const personalityDesc = getDynamicPersonalityDescriptor(agent);

  const focusNodes = graph?.nodeById && agent.focusNodeIds?.length
    ? agent.focusNodeIds
        .map((id) => graph.nodeById.get(id)?.label)
        .filter(Boolean)
        .join(', ')
    : 'No specific nodes assigned.';

  const localEdges = graph?.nodeById && agent.localNeighborhood?.length
    ? agent.localNeighborhood
        .map((e) => `${e.src}->${e.dst}`)
        .join('; ')
        .slice(0, pl.localEdges)
    : 'None.';

  const ageStr = agent.age ? `Age: ${agent.age}.` : '';
  const genderStr = agent.gender ? `Gender: ${agent.gender}.` : '';
  const regionStr = agent.region ? `Region/Country: ${agent.region}.` : '';
  const pseudoNameStr = agent.pseudoName ? `Pseudo/Screen Name: ${agent.pseudoName}.` : '';

  const factsStr = (scenario.facts && scenario.facts.length > 0)
    ? `\nFacts: ${scenario.facts.slice(0, pl.factsCount).join(' | ').slice(0, pl.facts)}`
    : '';

  return `You are ${agent.name} (${pseudoNameStr || agent.name}), a ${agent.platform} user.
${ageStr} ${genderStr} ${regionStr}

Background: ${(agent.backstory || '').slice(0, pl.backstory)}

Personality: You are ${personalityDesc}.

Current views on this topic: ${posStr}

Relevant graph nodes: ${focusNodes}

Relevant local graph edges: ${localEdges}

Scenario being discussed: "${scenario.question}"${factsStr}

Voice style: ${platformVoice[agent.platform] || 'Write in a natural, authentic voice.'}

Rules:
1. Stay in character at all times. Do not break the fourth wall.
2. Your response should feel authentic to a real person on ${agent.platform}.
3. React only to what is present in the graph or the conversation history.
4. Do not invent nodes, IDs, or relationships.
5. You may change your mind if the argument is compelling. Show that shift.
6. For twitter and facebook, heavily encourage the use of #hashtags.
7. For reddit, discord, facebook, and twitter, strongly encourage using '@' to tag or reply to other agents directly when conversing.`.trim();
}

// ─── Private Helpers ──────────────────────────────────────────────

function _jitter(value, range) {
  const v = value + (Math.random() * 2 - 1) * range;
  return Math.max(0.05, Math.min(0.95, v));
}

function _buildPlatformRotation(count) {
  const rotation = [];
  const weights = { twitter: 3, reddit: 3, hn: 2, discord: 2, market: 2, facebook: 3 };
  const pool = [];

  for (const [platform, w] of Object.entries(weights)) {
    for (let i = 0; i < w; i++) pool.push(platform);
  }

  for (let i = 0; i < count; i++) {
    rotation.push(pool[i % pool.length]);
  }

  return rotation;
}

export { ALL_PLATFORMS };