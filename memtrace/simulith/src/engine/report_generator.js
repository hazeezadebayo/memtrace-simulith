/* ==================================================================
   simulith/src/report_generator.js
   Generates the final mesh intelligence report after all ticks.

   Computes:
     - Consensus / dissent map across topics
     - Most influential agents (by reactions received)
     - Biggest belief-shifters
     - Timeline of key interactions
     - Overall mesh verdict on the scenario
   ================================================================== */

import { beliefDelta } from '../agents/belief_state.js';
import { getEnvironmentalState } from '../utils/extra.js';
import { scoreBranches } from './scoring.js';
import { buildVerdictPrompt } from '../llm/prompts.js';
import { callLLMWithSystem, REPORT_SYSTEM_PROMPT } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { DOMAIN_POWER_MULTIPLIERS } from '../data/manifest.js';


/**
 * Generate the full simulation report.
 *
 * @param {string} simId
 * @param {Array}  agents       - agents with final beliefs + _initialBeliefs snapshot
 * @param {Array}  interactions - all interaction events across all ticks
 * @param {Array}  branches     - optional alternate branches
 * @param {object} scenario     - optional scenario details
 * @param {object} evidence     - optional evidence profile
 * @returns {object} report
 */
export async function generateReport(simId, agents, interactions, branches = [], scenario = null, evidence = null, interviews = null) {
  const consensus = _computeConsensus(agents);
  const influence = _computeInfluence(agents, interactions);
  const shifters = _computeShifters(agents);
  const timeline = _buildTimeline(interactions);
  const verdict = await _computeVerdict(consensus, agents, interactions, branches, scenario, evidence, interviews);
  const topThreads = _extractTopThreads(interactions, agents);
  const { hashtags, keywords } = _extractHashtagsAndPhrases(interactions, agents);
  const dailySpeakers = _buildDailySpeakerTimeline(interactions, simId);

  return {
    simId,
    generatedAt: new Date().toISOString(),
    agentCount: agents.length,
    totalInteractions: interactions.length,
    consensus,
    verdict,
    topInfluencers: influence.slice(0, 5),
    biggestShifters: shifters.slice(0, 5),
    topThreads: topThreads.slice(0, 6),
    timeline: timeline.slice(0, 20), // key moments only
    platformBreakdown: _platformBreakdown(agents, interactions),
    hashtags,
    keywords,
    dailySpeakers,
    interviews: interviews?.interviews || null,
    interviewSynthesis: interviews?.synthesis || null,
  };
}

// ─── Consensus Map ─────────────────────────────────────────────────

function _computeConsensus(agents) {
  const topicSums = {};
  const topicCounts = {};

  for (const agent of agents) {
    for (const [topic, position] of Object.entries(agent.beliefs?.positions || {})) {
      topicSums[topic] = (topicSums[topic] || 0) + position;
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }

  const topics = {};
  for (const topic of Object.keys(topicSums)) {
    const avg = topicSums[topic] / topicCounts[topic];
    const positions = agents.map(a => a.beliefs?.positions?.[topic] ?? 0);
    const stdDev = _stdDev(positions);
    topics[topic] = {
      avgPosition: +avg.toFixed(3),
      polarization: +stdDev.toFixed(3),
      verdict: avg > 0.2 ? 'supportive' : avg < -0.2 ? 'skeptical' : 'divided',
      agentsFor: positions.filter(p => p > 0.15).length,
      agentsAgainst: positions.filter(p => p < -0.15).length,
      agentsNeutral: positions.filter(p => Math.abs(p) <= 0.15).length,
    };
  }

  return topics;
}

// ─── Influence Score ───────────────────────────────────────────────

function _computeInfluence(agents, interactions) {
  const scores = {};
  for (const agent of agents) scores[agent.id] = { agent, score: 0, reactionsReceived: 0 };

  for (const event of interactions) {
    const targetAgentId = event.targetAgentId || event.target_agent_id;
    if (targetAgentId && scores[targetAgentId]) {
      scores[targetAgentId].score += 1;
      scores[targetAgentId].reactionsReceived += 1;
    }
    // Writing reactions signal the most influence: positive = strong endorsement, negative = contested attention
    if ((event.type === 'comment' || event.type === 'quote') && targetAgentId && scores[targetAgentId]) {
      const sentiment = event._sentiment;
      if (sentiment === 'positive') scores[targetAgentId].score += 1.5;
      else if (sentiment === 'negative') scores[targetAgentId].score += 0.8; // contested = still influential
    }
  }

  return Object.values(scores)
    .map(({ agent, score, reactionsReceived }) => ({
      agentId: agent.id,
      name: agent.name,
      platform: agent.platform,
      cluster: agent.cluster,
      influenceScore: +score.toFixed(1),
      reactionsReceived,
    }))
    .sort((a, b) => b.influenceScore - a.influenceScore);
}

// ─── Belief Shifters ───────────────────────────────────────────────

function _computeShifters(agents) {
  return agents
    .map(agent => {
      const shifts = agent._initialBeliefs
        ? beliefDelta(agent._initialBeliefs, agent.beliefs)
        : (agent._lastShifts || []);
      const magnitude = shifts.reduce((sum, s) => sum + Math.abs(s.delta), 0);
      return { agentId: agent.id, name: agent.name, platform: agent.platform, magnitude: +magnitude.toFixed(2), shifts };
    })
    .sort((a, b) => b.magnitude - a.magnitude);
}

// ─── Timeline ─────────────────────────────────────────────────────

function _buildTimeline(interactions) {
  // Key moments: writing reactions (comments/quotes carry debate) and early posts
  const key = interactions.filter(e =>
    e.type === 'comment' ||
    e.type === 'quote' ||
    (e.type === 'post' && e.tick <= 2)
  );
  return key.map(e => ({
    tick: e.tick,
    agentName: e.agent_name || e.agentName,
    type: e.type,
    sentiment: e._sentiment ?? null,
    agrees: e._agrees ?? null,
    content: (e.content || '').slice(0, 140),
    targetAgent: e.targetAgentId || e.target_agent_id,
    platform: e.platform,
  }));
}

// ─── Top Threads ───────────────────────────────────────────────────

function _extractTopThreads(interactions, agents) {
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]));
  // Group reactions around each original post
  const posts = interactions.filter(e => e.type === 'post');
  return posts
    .map(post => {
      const replies = interactions.filter(e => (e.targetInteractionId || e.target_interaction_id) === post.id);
      return {
        postId: post.id,
        agentId: post.agent_id || post.agentId,
        agentName: post.agent_name || post.agentName,
        platform: post.platform,
        tick: post.tick,
        content: post.content,
        replyCount: replies.length,
        replies: replies.slice(0, 3).map(r => ({
          agentName: r.agent_name || r.agentName,
          type: r.type,
          content: (r.content || '').slice(0, 100),
        })),
      };
    })
    .sort((a, b) => b.replyCount - a.replyCount);
}



async function _computeVerdict(consensus, agents, interactions = [], branches = [], scenario = null, evidence = null, interviews = null) {
  const topicPositions = {};
  for (const agent of agents) {
    const positions = agent.beliefs?.positions || {};
    for (const [topic, value] of Object.entries(positions)) {
      if (!topicPositions[topic]) topicPositions[topic] = [];
      topicPositions[topic].push({ agent, value });
    }
  }

  const topics = Object.keys(topicPositions);
  if (topics.length === 0) {
    return { stance: 'unknown', confidence: 0, summary: 'No data collected.' };
  }

  const activeDomain = scenario?.domain || 'SOCIETAL';
  const multipliers = DOMAIN_POWER_MULTIPLIERS[activeDomain] || {};

  const topicStats = [];
  for (const topic of topics) {
    const entries = topicPositions[topic];
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const rawVals = [];

    for (const entry of entries) {
      const w = multipliers[entry.agent.faction] || 1.0;
      totalWeightedScore += entry.value * w;
      totalWeight += w;
      rawVals.push(entry.value);
    }

    const weightedScore = totalWeightedScore / (totalWeight || 1.0);
    const avg = rawVals.reduce((s, v) => s + v, 0) / rawVals.length;
    const dev = _stdDev(rawVals);

    topicStats.push({ topic, avg, dev, weightedScore, polarizationEnergy: dev });
  }

  // Find the topic with the largest absolute weighted score
  topicStats.sort((a, b) => Math.abs(b.weightedScore) - Math.abs(a.weightedScore));

  // Force "core_premise" to be the decisive topic if it was tracked, so the verdict reflects the main question
  const coreTopicIndex = topicStats.findIndex(t => t.topic === 'core_premise');
  const decisive = coreTopicIndex !== -1 ? topicStats[coreTopicIndex] : topicStats[0];

  const avgPosition = decisive.avg;
  const polarization = decisive.dev;
  const weightedScore = decisive.weightedScore;
  const polarizationEnergy = decisive.polarizationEnergy;
  const decisiveTopic = decisive.topic;

  let stance = 'divided';
  if (weightedScore > 0.25) stance = 'go_/_approved';
  else if (weightedScore < -0.25) stance = 'abort_/_denied';
  else if (polarizationEnergy > 0.50) stance = 'systemic_deadlock';
  else if (weightedScore > 0.10) stance = 'leaning_supportive';
  else if (weightedScore < -0.10) stance = 'leaning_skeptical';

  const cleanTopicName = decisiveTopic.toUpperCase().replace(/_/g, ' ');

  const summaries = {
    leaning_supportive: `The mesh leans toward supporting "${cleanTopicName}" (Stance: ${weightedScore > 0 ? '+' : ''}${weightedScore.toFixed(2)}), driven by key faction brokers.`,
    'go_/_approved': `Mesh Verdict: GO / APPROVED for "${cleanTopicName}" (Stance: ${weightedScore > 0 ? '+' : ''}${weightedScore.toFixed(2)}), authorized by primary power brokers.`,
    leaning_skeptical: `The mesh leans skeptical/against "${cleanTopicName}" (Stance: ${weightedScore.toFixed(2)}), with major veto indicators.`,
    'abort_/_denied': `Mesh Verdict: ABORT / DENIED for "${cleanTopicName}" (Stance: ${weightedScore.toFixed(2)}), vetoed by risk managers.`,
    systemic_deadlock: `The mesh has entered a SYSTEMIC DEADLOCK over "${cleanTopicName}" (Conflict Energy: ${polarizationEnergy.toFixed(2)}). No clear consensus is possible due to severe factional division.`,
    divided: `The mesh is divided with no dominant view on "${cleanTopicName}".`,
  };

  let summary = summaries[stance] || 'Inconclusive.';

  // Inference Synthesis Layer (LLM Interpretation)
  if (DEFAULT_CONFIG.apiKey && scenario) {
    try {
      // 1. Group agents into camps and calculate total power weights
      let supportiveWeight = 0;
      let skepticalWeight = 0;
      const supportiveAgents = [];
      const skepticalAgents = [];
      const neutralAgents = [];

      for (const agent of agents) {
        const finalPos = agent.beliefs?.positions?.[decisiveTopic] ?? 0;
        const w = multipliers[agent.faction] || 1.0;
        if (finalPos > 0.15) {
          supportiveWeight += w;
          supportiveAgents.push({ agent, pos: finalPos, w });
        } else if (finalPos < -0.15) {
          skepticalWeight += w;
          skepticalAgents.push({ agent, pos: finalPos, w });
        } else {
          neutralAgents.push({ agent, pos: finalPos, w });
        }
      }

      // 2. Format the camp summaries
      const supportiveSummary = supportiveAgents.map(item => {
        const myEvents = (interactions || []).filter(e => (e.agent_id === item.agent.id || e.agentId === item.agent.id) && e.content);
        const latestEvent = myEvents[myEvents.length - 1];
        const comment = latestEvent ? latestEvent.content : item.agent.backstory || '';
        return `- [${item.agent.name}] (Faction: ${item.agent.faction}, Stance: ${item.pos > 0 ? '+' : ''}${item.pos.toFixed(2)}, Power Weight: ${item.w}): "${comment.slice(0, 100)}..."`;
      }).join('\n') || 'None.';

      const skepticalSummary = skepticalAgents.map(item => {
        const myEvents = (interactions || []).filter(e => (e.agent_id === item.agent.id || e.agentId === item.agent.id) && e.content);
        const latestEvent = myEvents[myEvents.length - 1];
        const comment = latestEvent ? latestEvent.content : item.agent.backstory || '';
        return `- [${item.agent.name}] (Faction: ${item.agent.faction}, Stance: ${item.pos.toFixed(2)}, Power Weight: ${item.w}): "${comment.slice(0, 100)}..."`;
      }).join('\n') || 'None.';

      const scenarioQuestion = scenario.question || '';
      const scenarioFacts = (scenario.facts || []).map(f => `- ${f}`).join('\n') || 'None';
      let interviewSection = '';
      if (interviews?.synthesis) {
        interviewSection = `\n<hypothetical_interviews>\n[POST-SIMULATION QUALITATIVE INTERVIEWS SYNTHESIS]\n(Note: This section explores hypothetical "What-If" scenarios to test agent boundaries. These are NOT facts of the original scenario.)\n${interviews.synthesis}\n</hypothetical_interviews>\n`;
      }
      const prompt = buildVerdictPrompt({
        scenarioQuestion, scenarioFacts, activeDomain, cleanTopicName,
        supportiveWeight, supportiveSummary, skepticalWeight,
        skepticalSummary, interviewSection
      });

      const response = await callLLMWithSystem(REPORT_SYSTEM_PROMPT, prompt);
      if (response && response.trim().length > 0) {
        summary = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
      console.error('[Report Generator] LLM synthesis failed, using fallback summary:', err.message);
    }
  }

  // Find loudest concern (countering voice)
  let loudestConcern = null;
  const opponents = agents.map(agent => {
    const pos = agent.beliefs?.positions?.[decisiveTopic] ?? 0;
    const dist = Math.abs(pos - avgPosition);
    const isOpposing = avgPosition >= 0 ? (pos < 0) : (pos > 0);
    return { agent, pos, dist, isOpposing };
  });

  opponents.sort((a, b) => {
    if (a.isOpposing && !b.isOpposing) return -1;
    if (!a.isOpposing && b.isOpposing) return 1;
    return b.dist - a.dist;
  });

  const loudest = opponents[0]?.agent;
  if (loudest) {
    const position = loudest.beliefs?.positions?.[decisiveTopic] ?? 0;
    const agentEvents = (interactions || []).filter(e => (e.agent_id === loudest.id || e.agentId === loudest.id) && e.content);
    const latestEvent = [...agentEvents].sort((a, b) => b.tick - a.tick)[0];
    const concernText = latestEvent ? latestEvent.content : (loudest.backstory || loudest.note || 'Nuanced perspective on the topic.');
    loudestConcern = {
      name: loudest.name,
      platform: loudest.platform,
      position: +position.toFixed(3),
      concern: concernText.slice(0, 160) + (concernText.length > 160 ? '...' : '')
    };
  }

  // Find top alternative
  let topAlternative = null;
  if (branches && branches.length > 1 && scenario && evidence) {
    try {
      const branchGraph = {
        items: (evidence.tensions || []).map(item => ({
          ...item,
          evidence: item.why || '',
          severity: 1
        })),
        summary: {
          strongestLabel: evidence.tensions?.[0]?.label || 'none',
          headline: evidence.tensions?.length ? `${evidence.tensions.length} pressure points found` : 'No strong pressure points',
          details: evidence.tensions ? evidence.tensions.map(item => item.label).join(', ') : ''
        }
      };

      // Populate reactions on agents for scoring compatibility
      agents.forEach(agent => {
        agent.reactions = branches.map(b => {
          const fit = _personaFit(agent, b);
          const finalStanceValue = agent.beliefs?.positions?.[decisiveTopic] ?? 0;
          const stance = finalStanceValue >= 0 ? 'support' : 'push back';
          return { branchId: b.id, stance };
        });
      });

      const scored = scoreBranches(branches, scenario, evidence, branchGraph, agents);
      if (scored && scored.length > 1) {
        let runnerUp = scored[1]; // default fallback

        try {
          const { getEmbedding, cosineSimilarity } = await import('../../../extension/llm/embedding.js');

          const topText = (scored[0].title + " " + (scored[0].description || "")).trim();
          const topEmb = await getEmbedding(topText, "xenova");

          if (topEmb) {
            for (let i = 1; i < scored.length; i++) {
              const altText = (scored[i].title + " " + (scored[i].description || "")).trim();
              const altEmb = await getEmbedding(altText, "xenova");
              if (altEmb) {
                const sim = cosineSimilarity(topEmb, altEmb);
                // Require semantic distinctness (< 0.75 similarity)
                if (sim < 0.75) {
                  runnerUp = scored[i];
                  break;
                }
              }
            }
          }
        } catch (e) {
          if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
          console.warn('[Report Generator] Semantic distinctness check failed, using default runner-up:', e.message);
        }

        if (runnerUp) {
          topAlternative = {
            title: runnerUp.title,
            description: runnerUp.description || '',
            score: runnerUp.score,
            probability: runnerUp.score
          };
        }
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
      console.error('Failed to compute alternative branches in Mesh:', err);
    }
  }

  return {
    stance,
    avgPosition: +weightedScore.toFixed(3),
    polarization: +polarization.toFixed(3),
    confidence: Math.round(Math.max(0, (1 - polarization) * 100)),
    summary,
    decisiveTopic: decisiveTopic,
    loudestConcern,
    topAlternative
  };
}

function _personaFit(persona, branch) {
  const risky = Number(persona.riskBias ?? 0.5);
  const evidence = Number(persona.evidenceDemand ?? 0.5);
  const novelty = Number(persona.noveltySeek ?? 0.5);
  const clarity = Number(persona.clarityNeed ?? 0.5);
  const branchSignal = (branch.fitTags || []).join(' ').toLowerCase();
  let score = 0.5;
  if (branchSignal.includes('test') || branchSignal.includes('proof') || branchSignal.includes('evidence')) score += evidence * 0.25;
  if (branchSignal.includes('launch') || branchSignal.includes('commit') || branchSignal.includes('move')) score += (1 - risky) * 0.15 + novelty * 0.15;
  if (branchSignal.includes('wait') || branchSignal.includes('pause') || branchSignal.includes('safety')) score += risky * 0.2 + clarity * 0.1;
  if (branchSignal.includes('narrow') || branchSignal.includes('scope')) score += clarity * 0.1;
  return Math.max(0, Math.min(1, score));
}

// ─── Platform Breakdown ────────────────────────────────────────────

function _platformBreakdown(agents, interactions) {
  const platforms = {};
  for (const agent of agents) {
    if (!platforms[agent.platform]) {
      platforms[agent.platform] = { agentCount: 0, postCount: 0, avgPosition: [] };
    }
    platforms[agent.platform].agentCount++;
    const agentPositions = Object.values(agent.beliefs?.positions || {});
    if (agentPositions.length > 0) {
      platforms[agent.platform].avgPosition.push(
        agentPositions.reduce((s, v) => s + v, 0) / agentPositions.length
      );
    }
  }

  for (const event of interactions) {
    const agent = agents.find(a => a.id === (event.agent_id || event.agentId));
    if (agent && platforms[agent.platform]) {
      platforms[agent.platform].postCount++;
    }
  }

  for (const [platform, data] of Object.entries(platforms)) {
    const positions = data.avgPosition;
    data.avgPosition = positions.length
      ? +(positions.reduce((s, v) => s + v, 0) / positions.length).toFixed(2)
      : 0;
  }

  return platforms;
}

// ─── Math ─────────────────────────────────────────────────────────

function _stdDev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─── Hashtag & Topic Extraction ────────────────────────────────────

function _extractHashtagsAndPhrases(interactions, agents = []) {
  const counts = {};
  const hashPattern = /#([a-zA-Z0-9_]{2,})/g;

  // Extract all node labels from agents' local neighborhoods
  const nodeLabels = new Set();
  if (agents) {
    for (const agent of agents) {
      if (agent.localNeighborhood) {
        for (const edge of agent.localNeighborhood) {
          if (edge.src) nodeLabels.add(edge.src.toLowerCase().trim());
          if (edge.dst) nodeLabels.add(edge.dst.toLowerCase().trim());
        }
      }
    }
  }

  const stopwords = new Set([
    'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent',
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont',
    'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have',
    'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him',
    'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt',
    'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not',
    'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
    'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such',
    'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres',
    'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too',
    'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent',
    'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom',
    'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve',
    'your', 'yours', 'yourself', 'yourselves', 'people', 'would', 'could', 'should', 'think', 'going',
    // Generic filler verbs, adverbs, and adjectives
    'given', 'limited', 'consider', 'crucial', 'potential', 'time', 'working',
    'need', 'needs', 'want', 'wants', 'seems', 'feels', 'make', 'makes', 'take', 'takes', 'good',
    'better', 'best', 'well', 'right', 'know', 'knows', 'look', 'looks', 'find', 'finds', 'sure',
    'clear', 'clearer', 'clearly', 'still', 'always', 'never', 'often', 'sometimes', 'help', 'helps',
    'valuable', 'value', 'values', 'important', 'importance', 'priority', 'prioritize', 'priorities',
    'focus', 'focused', 'focusing', 'focuses', 'stage', 'stages', 'early', 'late', 'later', 'next',
    'last', 'past', 'future', 'present', 'current', 'currently', 'decision', 'decisions', 'decide',
    'decided', 'action', 'actions', 'act', 'acting', 'build', 'building', 'builder', 'builders',
    'create', 'creating', 'creator', 'creators', 'generate', 'generating', 'generator', 'generators',
    'process', 'processing', 'system', 'systems', 'platform', 'platforms', 'agent', 'agents',
    'mesh', 'meshs', 'simulation', 'simulations', 'simulate', 'simulating', 'result', 'results',
    'output', 'outputs', 'input', 'inputs', 'data', 'information', 'info', 'fact', 'facts',
    'scenario', 'scenarios', 'question', 'questions', 'answer', 'answers', 'brief', 'executive',
    'factor', 'factors', 'council', 'councils', 'councilal', 'change', 'changes', 'changing', 'new',
    'old', 'way', 'ways', 'thing', 'things', 'point', 'points', 'idea', 'ideas', 'concept',
    'concepts', 'test', 'tests', 'testing', 'tester', 'testers', 'validate', 'validating',
    'validation', 'validations', 'feedback', 'feedbacks', 'response', 'responses', 'customer',
    'customers', 'user', 'users', 'risk', 'risks', 'risky', 'avoid', 'avoiding', 'avoidance',
    'mitigate', 'mitigating', 'mitigation', 'manage', 'managing', 'management', 'plan',
    'planning', 'plans', 'strategy', 'strategies', 'strategic', 'approach', 'approaches',
    'agree', 'agrees', 'disagree', 'disagrees', 'agreement', 'disagreement', 'opinion', 'opinions',
    'view', 'views', 'post', 'posts', 'reply', 'replies', 'comment', 'comments', 'tweet', 'tweets',
    'concerning', 'regarding', 'around', 'about', 'without', 'within', 'cannot', 'couldnt', 'shouldnt',
    'wouldnt', 'dont', 'doesnt', 'havent', 'hasnt', 'hadnt', 'isnt', 'arent', 'wasnt', 'werent',
    'having', 'doing', 'being', 'getting', 'using', 'trying', 'taking', 'making', 'building',
    'finding', 'knowing', 'looking', 'thinking', 'coming', 'going', 'doing', 'seeming', 'feeling',
    'instead', 'rather', 'highly', 'extremely', 'really', 'very', 'quite', 'fairly', 'pretty',
    'enough', 'much', 'more', 'most', 'less', 'least', 'some', 'any', 'none', 'many', 'few', 'several',
    // Hedge words / discourse markers
    'however', 'although', 'though', 'whereas', 'whereby', 'therefore', 'furthermore', 'moreover',
    'nevertheless', 'nonetheless', 'otherwise', 'meanwhile', 'subsequently', 'consequently',
    'perhaps', 'maybe', 'possibly', 'probably', 'likely', 'unlikely', 'certainly', 'surely',
    'might', 'must', 'shall', 'will', 'also', 'even', 'just', 'already', 'yet', 'still',
    // Weak generic verbs
    'provide', 'provides', 'provided', 'providing', 'ensure', 'ensures', 'ensuring', 'allow',
    'allows', 'allowing', 'require', 'requires', 'requiring', 'select', 'selects', 'selecting',
    'offer', 'offers', 'offering', 'enable', 'enables', 'enabling', 'involve', 'involves', 'involving',
    'include', 'includes', 'including', 'suggest', 'suggests', 'suggesting', 'indicate', 'indicates',
    'particularly', 'especially', 'specifically', 'generally', 'overall', 'primarily', 'essentially',
    'typically', 'effectively', 'relatively', 'significantly', 'approximately', 'simply', 'actually',
    'basically', 'mostly', 'largely', 'widely', 'likely', 'directly', 'fully', 'particularly',
    // Common generic nouns that carry no specificity
    'issue', 'issues', 'concern', 'concerns', 'aspect', 'aspects', 'level', 'levels', 'type', 'types',
    'part', 'parts', 'case', 'cases', 'example', 'examples', 'instance', 'instances', 'side', 'sides',
    'area', 'areas', 'field', 'fields', 'term', 'terms', 'sense', 'context', 'basis', 'number',
    'amount', 'rate', 'rates', 'impact', 'impacts', 'effect', 'effects', 'affect', 'affects',
    'group', 'groups', 'set', 'sets', 'kind', 'kinds', 'form', 'forms', 'model', 'models',
    'something', 'nothing', 'anything', 'everything', 'someone', 'nobody', 'anyone', 'everyone'
  ]);

  // Collect actual #hashtags and keyword frequencies separately
  const hashtagCounts = {};
  const wordCounts = {};

  for (const e of interactions) {
    const text = e.content || '';

    // 1. Extract actual #hashtags from agent content
    let match;
    const tagSet = new Set();
    hashPattern.lastIndex = 0;
    while ((match = hashPattern.exec(text)) !== null) {
      tagSet.add('#' + match[1].toLowerCase());
    }
    for (const tag of tagSet) {
      hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
    }

    // 2. Extract meaningful keywords as fallback
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9#\s]/g, ' ')
      .split(/\s+/);

    const uniqueWords = new Set(words.filter(w => w.length > 4 && !w.startsWith('#')));
    for (const w of uniqueWords) {
      if (nodeLabels.has(w)) {
        wordCounts[w] = (wordCounts[w] || 0) + 5;
      } else if (!stopwords.has(w)) {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      }
    }
  }

  // Real #hashtags ranked by frequency (no min-frequency gate — even 1 real hashtag counts)
  const hashtags = Object.entries(hashtagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag]) => tag);

  // Keyword fallback: only words with frequency >= 2
  const keywords = Object.entries(wordCounts)
    .filter(([, freq]) => freq >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);

  return { hashtags, keywords };
}

// ─── Speaker Timeline Generator ────────────────────────────────────

function _buildDailySpeakerTimeline(interactions, simId) {
  const sorted = [...interactions].sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return new Date(a.created_at || a.createdAt || 0).getTime() - new Date(b.created_at || b.createdAt || 0).getTime();
  });

  const ticks = [...new Set(sorted.map(e => e.tick))];
  const maxTicks = Math.max(...ticks, 3);

  const ticksMap = {};
  for (const tick of ticks) {
    ticksMap[tick] = sorted.filter(e => e.tick === tick);
  }

  const dailySpeakers = {};

  for (const tick of ticks) {
    const list = ticksMap[tick];
    const totalInTick = list.length;
    list.forEach((event, index) => {
      const state = getEnvironmentalState(tick, maxTicks, index, totalInTick, simId);
      const dayKey = `Day ${state.day}`;
      if (!dailySpeakers[dayKey]) {
        dailySpeakers[dayKey] = [];
      }

      // Real emitted event types: post, reply, comment, quote, like
      // 'agree' and 'disagree' are legacy types that no longer exist in the pipeline.
      const isSpeech = ['post', 'reply', 'comment', 'quote', 'like'].includes(event.type);
      if (isSpeech && (event.agent_name || event.agentName)) {
        dailySpeakers[dayKey].push({
          agentName: event.agent_name || event.agentName,
          platform: event.platform || 'general',
          time: state.formattedTime,
          timeOfDay: state.timeOfDay,
          type: event.type
        });
      }
    });
  }

  return dailySpeakers;
}
