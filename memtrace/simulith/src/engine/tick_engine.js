/* ==================================================================
   simulith/src/tick_engine.js
   One simulation tick:
     1. Each active agent generates a post (LLM)
     2. Select 1-3 reactors per post (heuristic)
     3. Each reactor generates a reaction (LLM)
     4. Nudge beliefs via heuristic formula
     5. Persist all events to SQLite
     6. Update graph edges
   ================================================================== */

import { randomUUID } from 'node:crypto';
import { nudgeBeliefs, applyOwnPostFeedback, beliefDelta, slugify, applyCascadeTippingPoints, evaluateDynamicFactionTipping } from '../agents/belief_state.js';
import { addInteractionBatch, saveAgent, upsertEdge } from '../db/agent_memory.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { getEmbedding, cosineSimilarity } from '../../../extension/llm/embedding.js';
import { callLLM } from '../llm/ai.js';
import { getEnvironmentPromptString } from '../utils/extra.js';
import { buildAgentSystemPrompt } from '../agents/mesh.js';

// How many agents post per tick (fraction of total)
const POST_FRACTION = 0.7;


// ─── Main Tick ─────────────────────────────────────────────────────

/**
 * Run one tick of the simulation.
 *
 * @param {string}   simId    - simulation UUID
 * @param {Array}    agents   - array of agent objects (mutated in place)
 * @param {number}   tick     - current tick number (1-indexed)
 * @param {object}   scenario - { question, facts, domain }
 * @param {Function} emit     - progress emitter (stage, message, details)
 * @param {object}   graph    - scenario graph ontology
 * @param {Array}    branches - alternate strategy branches (schemas)
 * @returns {Array}  events   - all interaction events from this tick
 */
export async function runTick(simId, agents, tick, scenario, emit = () => { }, graph = null, branches = [], globalSummary = '', shockEvent = null) {
  emit('tick', `Tick ${tick}: agents deliberating...`, { tick, agentCount: agents.length });

  const events = [];
  const now = () => new Date().toISOString();

  // Read config values from MEMTRACE block (Central config logic)
  const cfg = DEFAULT_CONFIG.MEMTRACE || {};
  const numPostsPerAgent = cfg.num_posts_per_agent || 3;
  const postsExposedPerAgent = cfg.posts_exposed_per_agent || 2;
  const interactionCycles = cfg.interaction_cycles || 1;
  const targetInteractionsPerCycle = cfg.target_interactions_per_cycle || 15;

  const maxTicks = scenario.maxTicks || 3;
  const activeAgents = [...agents];

  let replenishmentRounds = 0;
  const maxReplenishments = cfg.max_replenishments || 4;
  const reactionEvents = [];
  const getInteractionsCount = () => reactionEvents.length;

  const agentExposed = {};
  for (const a of activeAgents) agentExposed[a.id] = new Set();

  while (getInteractionsCount() < targetInteractionsPerCycle && replenishmentRounds < maxReplenishments) {
    if (replenishmentRounds > 0) {
      emit('tick', `Tick ${tick}: Target interactions not met (${getInteractionsCount()}/${targetInteractionsPerCycle}). Replenishment wave ${replenishmentRounds}...`, { tick });
    }

    // 1. Generate posts for all agents (numPostsPerAgent posts per agent)
    for (let postIdx = 0; postIdx < numPostsPerAgent; postIdx++) {
      // Shuffle active agents to prevent ordering bias during generation
      const shuffledAgents = _shuffle(activeAgents);

      // Batch generate posts for this index (max 5 concurrent)
      const postResults = await _batchGenerate(shuffledAgents, (agent, idx) => {
        const actionIndex = postIdx * activeAgents.length + idx;
        const totalActions = activeAgents.length * numPostsPerAgent * 2;
        return _generatePost(agent, scenario, tick, maxTicks, actionIndex, totalActions, simId, emit, graph, branches, globalSummary, shockEvent, postIdx, numPostsPerAgent, replenishmentRounds);
      });

      const postEventsWithScores = await Promise.all(postResults.map(async ([agent, content]) => {
        if (!content) return null;
        const score = await _scoreContent(content, false, scenario.topics || []);
        return { agent, content, score };
      }));

      for (const item of postEventsWithScores) {
        if (!item) continue;
        const { agent, content, score } = item;
        const postId = randomUUID();
        const event = {
          id: postId,
          simId,
          tick,
          agentId: agent.id,
          agentName: agent.name,
          type: 'post',
          targetAgentId: null,
          targetInteractionId: null,
          content,
          platform: agent.platform,
          likes: 0,
          createdAt: now(),
          _sentiment: score.sentiment,
          _agrees: score.agrees,
          _stances: score.stances,
        };
        events.push(event);
        agent.recentPostIds.push(postId);
        if (agent.recentPostIds.length > 5) agent.recentPostIds.shift();
      }
    }

    emit('tick', `Tick ${tick}: ${events.length} posts generated. Generating reactions...`, { tick });

    // 2. Generate reactions using pairwise post exposure rules
    for (let cycle = 1; cycle <= interactionCycles; cycle++) {
      if (getInteractionsCount() >= targetInteractionsPerCycle) {
        break;
      }

      // Build pairwise candidate pairs for this cycle
      const candidatePairs = [];
      for (const observer of activeAgents) {
        for (const poster of activeAgents) {
          if (poster.id === observer.id) continue;

          // Get poster's posts in this tick that observer has NOT yet reacted to/ignored
          const posterPosts = events.filter(p => p.agentId === poster.id && p.type === 'post' && !agentExposed[observer.id].has(p.id));

          // Randomly select up to postsExposedPerAgent from them
          const shuffledPosts = _shuffle(posterPosts);
          const selectedPosts = shuffledPosts.slice(0, postsExposedPerAgent);

          for (const post of selectedPosts) {
            candidatePairs.push({ observer, post });
          }
        }
      }

      // Shuffle candidate pairs to prevent ordering bias
      const shuffledPairs = _shuffle(candidatePairs);

      for (const { observer, post } of shuffledPairs) {
        if (getInteractionsCount() >= targetInteractionsPerCycle) {
          break;
        }

        // Track exposure
        agentExposed[observer.id].add(post.id);

        // Enforce active platform alignment
        observer.platform = post.platform;

        const actionIndex = events.length + reactionEvents.length;
        const totalActions = events.length + targetInteractionsPerCycle;

        try {
          const reactionContent = await _generateReaction(
            observer,
            post,
            scenario,
            tick,
            maxTicks,
            actionIndex,
            totalActions,
            simId,
            emit,
            graph,
            branches,
            globalSummary,
            shockEvent
          );

          if (!reactionContent) continue;

          const score = await _scoreContent(reactionContent, true, scenario.topics || []);

          const reactionEvent = {
            id: randomUUID(),
            simId,
            tick,
            agentId: observer.id,
            agentName: observer.name,
            type: 'reply',
            targetAgentId: post.agentId,
            targetInteractionId: post.id,
            content: reactionContent,
            platform: observer.platform,
            likes: 0,
            createdAt: now(),
            _sentiment: score.sentiment,
            _agrees: score.agrees,
            _stances: score.stances,
          };

          reactionEvents.push(reactionEvent);
        } catch (err) {
          if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
          console.error(`[Tick Engine] Reaction generation failed for ${observer.name}:`, err.message);
        }
      }
    }

    replenishmentRounds++;
  }

  const allEvents = [...events, ...reactionEvents];

  // 4. Heuristic belief nudge (async — calls evaluateDynamicFactionTipping internally)
  await _applyBeliefNudges(agents, allEvents, scenario, graph);

  // 5. Persist all events to DB
  await addInteractionBatch(allEvents);

  // 6. Persist updated agent beliefs
  const agentSaves = agents.map(a => saveAgent(a));
  await Promise.all(agentSaves);

  // 7. Update graph edges
  await _updateGraphEdges(simId, reactionEvents);

  emit('tick', `Tick ${tick} complete. ${allEvents.length} events recorded.`, {
    tick,
    posts: events.length,
    reactions: reactionEvents.length,
  });

  return allEvents;
}

// ─── Post Generation ───────────────────────────────────────────────

async function _generatePost(agent, scenario, tick, maxTicks, actionIndex, totalActions, simId, emit = () => { }, graph = null, branches = [], globalSummary = '', shockEvent = null, postIdx = 0, numPostsPerAgent = 1, replenishmentRound = 0) {
  if (agent.platforms && agent.platforms.length > 0) {
    agent.platform = agent.platforms[Math.floor(Math.random() * agent.platforms.length)];
  }
  emit('tick', `Agent ${agent.name} is drafting a post on ${agent.platform}...`);
  const envString = getEnvironmentPromptString(tick, maxTicks, actionIndex, totalActions, simId);
  const systemPrompt = buildAgentSystemPrompt(agent, scenario, agent.beliefs, graph);

  const pl = DEFAULT_CONFIG.promptLimits;
  const alternateRealitiesStr = branches && branches.length > 0
    ? `Alternate Paths:\n${branches.map(b => `- ${b.title}`).join('\n').slice(0, pl.alternateRealities)}`
    : '';

  let postContextStr = numPostsPerAgent > 1
    ? `\nThis is post ${postIdx + 1} of ${numPostsPerAgent}. Make it unique, explore a different angle.`
    : '';
  
  if (replenishmentRound > 0) {
    postContextStr += `\nCRITICAL: This is replenishment wave ${replenishmentRound} for this tick. You MUST NOT repeat ideas you just posted. Council to a completely new argument or aspect of the debate.`;
  }

  const prompt = `/no_think
${systemPrompt}

${envString}

[ROUND MEMORY]
${(globalSummary || 'First round.').slice(0, pl.globalSummary)}

[YOUR LAST ACTION]
${agent.lastAction || 'None'}

[SHOCK]
${shockEvent ? `${shockEvent.title}: ${shockEvent.description}` : 'None.'}

${alternateRealitiesStr}

Post on ${agent.platform}.${postContextStr}
IMPORTANT: Output ONLY the post content. No labels, no quotes, no intro.`.trim();

  try {
    const text = await callLLM(prompt);
    const cleaned = _cleanOutput(text, agent.platform);
    agent.lastAction = `Posted on ${agent.platform}: "${cleaned.slice(0, 60)}..."`;
    emit('tick', `Agent ${agent.name} posted: "${cleaned.slice(0, 80)}..."`);
    return cleaned;
  } catch (e) {
    if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
    console.error(`[Tick] Post generation failed for ${agent.name}:`, e.message);
    return null;
  }
}

// ─── Reaction Generation ───────────────────────────────────────────

async function _generateReaction(reactor, postEvent, scenario, tick, maxTicks, actionIndex, totalActions, simId, emit = () => { }, graph = null, branches = [], globalSummary = '', shockEvent = null) {
  reactor.platform = postEvent.platform;
  emit('tick', `Agent ${reactor.name} is reading ${postEvent.agentName}'s post and drafting a reaction...`);
  const envString = getEnvironmentPromptString(tick, maxTicks, actionIndex, totalActions, simId);
  const systemPrompt = buildAgentSystemPrompt(reactor, scenario, reactor.beliefs, graph);

  const pl = DEFAULT_CONFIG.promptLimits;
  const alternateRealitiesStr = branches && branches.length > 0
    ? `Alternate Paths:\n${branches.map(b => `- ${b.title}`).join('\n').slice(0, pl.alternateRealities)}`
    : '';

  const prompt = `/no_think
${systemPrompt}

${envString}

[ROUND MEMORY]
${(globalSummary || 'First round.').slice(0, pl.globalSummary)}

[YOUR LAST ACTION]
${reactor.lastAction || 'None'}

[SHOCK]
${shockEvent ? `${shockEvent.title}: ${shockEvent.description}` : 'None.'}

${alternateRealitiesStr}

${postEvent.agentName} posted: "${postEvent.content.slice(0, pl.postContent)}"

Write your REACTION. Agree, disagree, add nuance, or ask a question.
IMPORTANT: Output ONLY your reply. No labels, no quotes, no intro.`.trim();

  try {
    const text = await callLLM(prompt);
    const cleaned = _cleanOutput(text, reactor.platform);
    reactor.lastAction = `REACTION to ${postEvent.agentName}: "${cleaned.slice(0, 60)}..."`;
    emit('tick', `Agent ${reactor.name} reacted: "${cleaned.slice(0, 80)}..."`);
    return cleaned;
  } catch (e) {
    if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
    console.error(`[Tick] Reaction generation failed for ${reactor.name}:`, e.message);
    return null;
  }
}

// ─── Belief Nudge Application ──────────────────────────────────────

async function _applyBeliefNudges(agents, events, scenario, graph = null) {
  const topics = scenario?.topics || [];
  // Index posts by agent for reference
  const postsByAgent = {};
  for (const e of events) {
    if (e.type === 'post') {
      postsByAgent[e.agentId] = postsByAgent[e.agentId] || [];
      postsByAgent[e.agentId].push(e);
    }
  }

  // For each agent, collect what they observed (posts from others + reactions to their posts)
  for (const agent of agents) {
    const observations = [];

    for (const event of events) {
      if (event.agentId === agent.id) continue; // skip own posts

      if (event.type === 'post' || event.type === 'reply') {
        const stances = event._stances || {};
        if (Object.keys(stances).length === 0) continue;

        const likeCount = events.filter(e =>
          e.type === 'like' && e.targetInteractionId === event.id
        ).length;

        observations.push({
          authorId: event.agentId,
          stances,
          likeCount,
          type: event.type,
          sentiment: event._sentiment ?? null,
          agrees: event._agrees ?? null,
          argumentKey: event.content.slice(0, 60),
        });
      } else if (event.type === 'like' && event.targetAgentId === agent.id) {
        // Positive feedback on own post — only drives trust, no stance shift
        const postEvent = events.find(e => e.id === event.targetInteractionId);
        const stances = postEvent?._stances || {};
        if (Object.keys(stances).length === 0) continue;

        observations.push({
          authorId: event.agentId,
          stances: {},
          likeCount: 0,
          type: event.type,
          sentiment: 'positive',
          agrees: true,
          argumentKey: null,
        });
      }
    }

    if (observations.length > 0) {
      const prevBeliefs = agent.beliefs;
      agent.beliefs = nudgeBeliefs(agent.beliefs, observations, {
        seenArguments: agent.seenArguments,
        persona: agent,
        agentFaction: agent.faction
      });
      const shifts = beliefDelta(prevBeliefs, agent.beliefs);
      if (shifts.length > 0) {
        agent._lastShifts = shifts; // expose for report generator
      }
    }
  }

  // Apply cascading tipping points
  applyCascadeTippingPoints(agents);
  if (graph && scenario) {
    await evaluateDynamicFactionTipping(agents, graph, scenario);
  }
}

// ─── Graph Edge Updates ────────────────────────────────────────────

async function _updateGraphEdges(simId, reactionEvents) {
  const edgeOps = [];
  for (const event of reactionEvents) {
    if (!event.targetAgentId) continue;

    // The 'agrees' field might be boolean (true/false) from JSON parsing
    // OR numeric (1.0/-1.0) from the semantic fallback logic.
    let weight = 0.0;
    if (event._agrees === false || event._agrees === -1.0 || event._agrees < 0) {
      weight = -0.6; // Red (Antagonism / Disagreement)
    } else if (event._agrees === true || event._agrees === 1.0 || event._agrees > 0) {
      weight = 0.7; // Green (Follow / Agreement)
    }

    // Realism Fix: We do NOT create an edge for neutral or unclear replies.
    // This prevents the graph from turning into an unrealistic hairball where everyone follows everyone.
    if (weight === 0.0) continue;

    edgeOps.push(upsertEdge({
      simId,
      srcAgent: event.agentId,
      dstAgent: event.targetAgentId,
      relType: 'replied_to',
      weight,
      evidence: event.content.slice(0, 120),
    }));
  }
  await Promise.all(edgeOps);
}

// ─── Helpers ───────────────────────────────────────────────────────

function _selectPosters(agents) {
  const n = Math.max(1, Math.round(agents.length * POST_FRACTION));
  return _shuffle([...agents]).slice(0, n);
}

function _selectReactors(agents, excludeId, max) {
  return _shuffle(agents.filter(a => a.id !== excludeId)).slice(0, max);
}

async function _batchGenerate(agents, fn, concurrency = 5) {
  const results = [];
  for (let i = 0; i < agents.length; i += concurrency) {
    const batch = agents.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (agent, batchIndex) => {
        const globalIndex = i + batchIndex;
        const output = await fn(agent, globalIndex);
        return [agent, output];
      })
    );
    results.push(...batchResults);
  }
  return results;
}

// Categorical label → deterministic numeric stance.
// The LLM CANNOT corrupt this — only these 4 strings are valid keys.
const STANCE_MAP = {
  strongly_for: 1.0,
  for: 0.6,
  against: -0.6,
  strongly_against: -1.0,
};

// Same whitelist for agrees.
const AGREES_MAP = { yes: true, no: false, unclear: null };

// Cached Prototype Embeddings for Semantic Fallback
const semanticCache = {
  positive: null,
  negative: null,
  agree: null,
  disagree: null
};

/**
 * Initializes the prototype embeddings for semantic fallback if they don't exist.
 */
async function initSemanticCache() {
  if (!semanticCache.positive) {
    semanticCache.positive = await getEmbedding("positive supportive good great excellent valuable success benefit opportunity proven effective well-founded promising", "xenova");
  }
  if (!semanticCache.negative) {
    semanticCache.negative = await getEmbedding("negative skeptical caution risk expensive fail failure red flag overpriced doubt disagree unclear overhead bad terrible flaw", "xenova");
  }
  if (!semanticCache.agree) {
    semanticCache.agree = await getEmbedding("agree correct exactly absolutely spot on support this", "xenova");
  }
  if (!semanticCache.disagree) {
    semanticCache.disagree = await getEmbedding("disagree caution doubt objection oppose red flag", "xenova");
  }
}

/**
 * Deep Semantic Fallback using Xenova cosine similarity.
 */
async function getSemanticFallback(content, type = 'sentiment') {
  await initSemanticCache();
  const inputEmb = await getEmbedding(content, "xenova");
  if (!inputEmb) return null;

  if (type === 'sentiment') {
    const posScore = cosineSimilarity(inputEmb, semanticCache.positive);
    const negScore = cosineSimilarity(inputEmb, semanticCache.negative);
    return posScore > negScore ? 'positive' : 'negative';
  } else if (type === 'agreement') {
    const agreeScore = cosineSimilarity(inputEmb, semanticCache.agree);
    const disagreeScore = cosineSimilarity(inputEmb, semanticCache.disagree);
    return agreeScore > disagreeScore ? 1.0 : -1.0;
  }
  return null;
}

/**
 * Zero-shot LLM semantic extraction with deterministic categorical mapping.
 * The LLM outputs category labels; JS does the numeric conversion.
 * This is immune to garbage floats, nulls, "nu", "N/A" etc.
 * Returns { sentiment, agrees, stances }.
 */
async function _scoreContent(content, isReply, topics) {
  if (!content || !DEFAULT_CONFIG.apiKey) {
    return { sentiment: 'neutral', agrees: null, stances: {} };
  }

  const topicsStr = (topics && topics.length > 0) ? topics.join(', ') : 'none provided';
  const prompt = `/no_think
Analyze this social media ${isReply ? 'reply' : 'post'}:
"${content}"

Topics of interest: ${topicsStr}

Return ONLY valid JSON matching this exact structure. No markdown.
{
  "sentiment": "neutral", // Choose exactly one: positive, negative, or neutral
  "agrees": ${isReply ? '"unclear", // Choose exactly one: yes, no, or unclear' : '"unclear"'},
  "stances": {
    "topic_name": "for" // Example. For each relevant topic, choose exactly one: strongly_for, for, against, strongly_against. Omit any topic not discussed.
  }
}

RULES:
- Identify a MAXIMUM OF 2 topics that are most strongly and EXPLICITLY discussed in the text.
- Do NOT include more than 2 topics in the "stances" object. Less is better if the topic isn't a core focus.
- You MUST ONLY use keys from the provided 'Topics of interest' list (${topicsStr}) in the "stances" object. Do NOT invent new keys.
- If a topic is not discussed, DO NOT include it at all. Omit the key entirely.
- Use only the exact label values listed above. No other strings, no numbers, no null.
- Be decisive. Do not default to 'neutral' or 'unclear' if the post expresses clear support, push back, skepticism, or caution.`.trim();

try {
    const text = await callLLM(prompt);
    const clean = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);

      // Deterministic agrees mapping — anything not in the whitelist becomes null
      const agrees = AGREES_MAP.hasOwnProperty(parsed.agrees) ? AGREES_MAP[parsed.agrees] : null;

      // Deterministic stance mapping — only valid category labels survive and match topics
      const stances = {};
      if (parsed.stances && typeof parsed.stances === 'object') {
        for (const [topic, label] of Object.entries(parsed.stances)) {
          const cleanTopic = String(topic || '').trim();
          const matchedTopic = topics.find(t => t.toLowerCase() === cleanTopic.toLowerCase());
          if (matchedTopic && STANCE_MAP.hasOwnProperty(label)) {
            stances[matchedTopic] = STANCE_MAP[label];
          }
        }
      }

      let sentiment = ['positive', 'negative', 'neutral'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
      let finalAgrees = agrees;

      // Comprehensive Lexical Fallback (with negation window) for Neutral/Unclear results
      const negators = new Set(['not', 'no', 'never', 'dont', "don't", 'doesnt', "doesn't", 'wont', "won't", 'cant', "can't", 'hardly', 'lack', 'without']);
      const lowerContent = String(content || '').toLowerCase();
      const tokens = lowerContent.split(/[\s,.-]+/);

      if (sentiment === 'neutral') {
        const positiveWords = new Set(['support', 'agree', 'good', 'great', 'excellent', 'valuable', 'success', 'benefit', 'opportunity', 'proven', 'effective', 'yes', 'well-founded', 'promising']);
        const negativeWords = new Set(['skeptical', 'skepticism', 'caution', 'risk', 'expensive', 'fail', 'failure', 'red flag', 'overpriced', 'doubt', 'disagree', 'unclear', 'no', 'overhead', 'bad', 'terrible', 'flaw']);
        
        let posCount = 0;
        let negCount = 0;

        for (let i = 0; i < tokens.length; i++) {
          const w = tokens[i];
          const isPos = positiveWords.has(w);
          const isNeg = negativeWords.has(w) || (w === 'red' && tokens[i+1] === 'flag');
          
          if (isPos || isNeg) {
            let isNegated = false;
            for (let j = Math.max(0, i - 2); j < i; j++) {
              if (negators.has(tokens[j])) isNegated = !isNegated;
            }
            if (isPos) { isNegated ? negCount++ : posCount++; }
            if (isNeg) { isNegated ? posCount++ : negCount++; }
          }
        }
        
        if (posCount > negCount + 1) {
          sentiment = 'positive';
        } else if (negCount > posCount) {
          sentiment = 'negative';
        } else {
          // Tier-2 Deep Semantic Fallback
          const sem = await getSemanticFallback(content, 'sentiment');
          if (sem) sentiment = sem;
        }
      }

      if (isReply && (finalAgrees === null || finalAgrees === 0.0)) {
        const agreementWords = new Set(['agree', 'correct', 'exactly', 'absolutely']);
        const disagreementWords = new Set(['disagree', 'caution', 'doubt', 'objection', 'oppose']);
        
        let agreeCount = 0;
        let disagreeCount = 0;

        for (let i = 0; i < tokens.length; i++) {
          const w = tokens[i];
          const isPos = agreementWords.has(w) || (w === 'spot' && tokens[i+1] === 'on') || (w === 'support' && tokens[i+1] === 'this');
          const isNeg = disagreementWords.has(w) || (w === 'red' && tokens[i+1] === 'flag');
          
          if (isPos || isNeg) {
            let isNegated = false;
            for (let j = Math.max(0, i - 2); j < i; j++) {
              if (negators.has(tokens[j])) isNegated = !isNegated;
            }
            if (isPos) { isNegated ? disagreeCount++ : agreeCount++; }
            if (isNeg) { isNegated ? agreeCount++ : disagreeCount++; }
          }
        }
        
        if (agreeCount > disagreeCount) {
          finalAgrees = 1.0;
        } else if (disagreeCount > agreeCount) {
          finalAgrees = -1.0;
        } else {
          // Tier-2 Deep Semantic Fallback
          const sem = await getSemanticFallback(content, 'agreement');
          if (sem) finalAgrees = sem;
        }
      }

      return {
        sentiment,
        agrees: finalAgrees,
        stances,
      };
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
    console.warn('[Tick Engine Scoring] Failed:', err.message);
  }
  return { sentiment: 'neutral', agrees: null, stances: {} };
}

function _cleanOutput(text, platform) {
  let clean = String(text || '').trim();
  // Strip Qwen3.5 CoT blocks if /no_think was ignored or model is not Qwen3.5
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Remove any "As [name]:" prefixes the model adds
  clean = clean.replace(/^(as\s+\w[\w_]+:|post:|reply:|response:)\s*/i, '');
  // Enforce platform length constraints
  if (platform === 'twitter' && clean.length > 300) {
    clean = clean.slice(0, 280).trimEnd();
    // Don't cut mid-sentence
    const lastPeriod = clean.lastIndexOf('.');
    if (lastPeriod > 200) clean = clean.slice(0, lastPeriod + 1);
  }
  return clean;
}

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
