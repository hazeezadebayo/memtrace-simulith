/* ==================================================================
   simulith/src/memtrace_engine.js
   MemTrace Simulation Engine:
     1. Classifies domain dynamically via LLM (10 domains)
     2. Extracts Knowledge Graph (Nodes, Edges, Schema Types)
     3. Spawns 15 agents bound to KG factions
     4. Runs Round-by-Round simulation (max 3 default, 4 override)
     5. Enforces Prompt Matrix (Persona + Global Summary + Last Action + Shock)
     6. Performs stochastic shock calculations at end of rounds
     7. Handles social interactions (likes, reposts, comments, follow, mute, search)
     8. Generates final intelligence report and saves to SQLite
   ================================================================== */

import { randomUUID } from 'node:crypto';
import { callLLM } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { buildKnowledgeGraph, applyShockToGraph, getGraphSummary } from '../graph/knowledge_graph.js';
import { generateMemTraceMesh, normalizeMemTraceDomain } from '../agents/memtrace_mesh.js';
import { nudgeBeliefs, beliefDelta, summarizeBeliefs, applyCascadeTippingPoints, evaluateDynamicFactionTipping } from '../agents/belief_state.js';
import {
  createSimulation, completeSimulation, saveAgent,
  addInteractionBatch, upsertEdge, saveRoundSummary
} from '../db/agent_memory.js';
import { generateReport } from './report_generator.js';
import { getEnvironmentPromptString, setTotalSimulationHours } from '../utils/extra.js';
import { buildEvidenceProfile } from '../data/evidence.js';
import { proposeGenerativeBranches } from '../agents/generative.js';
import { conductInterviews } from '../agents/interview.js';
import { VALID_DOMAINS, DOMAIN_DESCRIPTIONS } from '../data/manifest.js';

// Seeded random number generator
function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

/**
 * Classifies the scenario question into one of the 10 MemTrace domains.
 */
export async function classifyMemTraceDomain(question, facts) {
  const domainsStr = Object.entries(DOMAIN_DESCRIPTIONS)
    .map(([name, desc]) => `- ${name}: ${desc}`)
    .join('\n');

  const prompt = `
You are an enterprise classification router. Analyze the user's question and match it to the most relevant simulation domain.

DOMAINS:
${domainsStr}

Question: "${question}"
Facts: ${(facts || []).slice(0, 3).join(', ')}

Return ONLY the domain name in uppercase (e.g. SOCIETAL or TECH). No explanations, no markdown formatting, just the raw word.
`.trim();

  let responseText = '';
  try {
    const response = await callLLM(prompt);
    responseText = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim().toUpperCase();
    for (const d of VALID_DOMAINS) {
      if (responseText.includes(d)) return d;
    }
  } catch (err) {
    console.error('[MemTrace Engine] LLM domain classification failed:', err.message);
  }

  // Fallback to keyword / embedding similarity checks via normalizeMemTraceDomain
  const queryToNormalize = responseText || question || '';
  try {
    const normalized = await normalizeMemTraceDomain(queryToNormalize);
    if (normalized) return normalized;
  } catch (e) {
    console.error('[MemTrace Engine] normalizeMemTraceDomain failed:', e.message);
  }
  return 'SOCIETAL';
}

/**
 * Synthesizes a dense single-paragraph Global Summary of all commentary in a round.
 */
export async function synthesizeRoundSummary(round, events, scenario = null) {
  const pl = DEFAULT_CONFIG.promptLimits;
  const postsText = events
    .filter(e => e.type === 'post' || e.type === 'reply' || e.type === 'comment' || e.type === 'quote')
    .slice(0, pl.summaryPostCount)
    .map(e => `${e.agentName}: "${e.content.slice(0, pl.summaryPostContent)}"`)
    .join('\n');

  const contextPrefix = scenario
    ? `Social simulation scenario: "${scenario.question}"\nFacts: ${(scenario.facts || []).slice(0, pl.factsCount).join('; ').slice(0, pl.facts)}\n\n`
    : '';

  const prompt = `${contextPrefix}Summarize the main conflicts, arguments, and shifts in sentiment from Round ${round} of this social simulation.
Commentary:
${postsText}

Compile this into a dense, single-paragraph Global Summary of the situation. 
Keep it under 150 words. Do not use bullet points or list items.`.trim();

  try {
    const response = await callLLM(prompt);
    return String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } catch (err) {
    console.error('[MemTrace Engine] Round synthesis failed, returning fallback summary:', err.message);
    return `In Round ${round}, agents engaged in debate over key facts, with significant disagreements surfacing across factions.`;
  }
}

/**
 * Extracts the single most contested claim from a round summary paragraph.
 * (~80 tokens input, ~25 tokens output — one call per round, not per agent.)
 * Returns a short human-readable sentence describing the fracture point.
 */
async function _extractContestedClaim(summary) {
  if (!summary || !DEFAULT_CONFIG.apiKey) return null;

  const prompt = `From this simulation round summary, identify the single most contested claim — the statement that divides the participants the most.
Summary: "${summary.slice(0, 500)}"

Return JSON only: {"contestedClaim": "<one sentence>"}`.trim();

  try {
    const response = await callLLM(prompt);
    const clean = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.contestedClaim && typeof parsed.contestedClaim === 'string') {
        return parsed.contestedClaim.slice(0, 200);
      }
    }
  } catch (err) {
    console.warn('[Contested Claim] Extraction failed:', err.message);
  }
  return null;
}

/**
 * Generates an unexpected shock event based on the scenario, domain, and knowledge graph.
 */
export async function generateUnexpectedShock(scenario, domain, graph, tick = 2, previousShocks = []) {
  const { getRandomShock } = await import('../data/shocks.js');
  
  const polarity = tick % 3 === 0 ? "positive" : "negative";
  const domainKey = (domain || 'SOCIETAL').toUpperCase();
  
  const selected = getRandomShock({ domain: domainKey, polarity, previousShocks });

  return {
    id: selected.id,
    title: selected.title,
    description: selected.description,
    justification: `Randomly selected from ${domainKey} ${polarity} pool.`
  };
}

/**
 * Execute the MemTrace Mesh Simulation.
 */
export async function simulateMemTraceMesh(input = {}, emit = () => {}) {
  const cfg = DEFAULT_CONFIG.MEMTRACE || { agentCount: 15, maxRounds: 3, maxRoundsOverride: 15, simulationDays: 3, shockThreshold: 0.72 };
  const pl = DEFAULT_CONFIG.promptLimits;

  const simId = randomUUID();
  const scenario = {
    question: String(input.question || input.prompt || '').trim(),
    facts:    Array.isArray(input.facts)   ? input.facts.filter(Boolean)   : [],
    customPersonas: Array.isArray(input.customPersonas) ? input.customPersonas.filter(Boolean) : [],
  };

  const agentCount = Math.max(4, Math.min(40, Number(input.agentCount) || cfg.agentCount || 15));
  const maxRounds = Math.max(3, Math.min(cfg.maxRoundsOverride || 15, Number(input.tickCount || input.maxRounds) || cfg.maxRounds || 3));

  const simDays = cfg.simulationDays || 3;
  setTotalSimulationHours(simDays * 24);

  emit('classify', `Classifying scenario to find the optimal domain...`);
  const domain = await classifyMemTraceDomain(scenario.question, scenario.facts);
  scenario.domain = domain;
  emit('classify', `Classification complete: matched with ${domain} domain.`, { domain });

  emit('graph', `Abstracting factual landscape into Knowledge Graph...`);
  const graph = await buildKnowledgeGraph(scenario);
  emit('graph', `Knowledge Graph built: ${graph.nodes.length} Nodes, ${graph.edges.length} Edges, ${graph.schemaTypes.length} Schema Types.`, {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    schemaTypes: graph.schemaTypes
  });

  const evidence = await buildEvidenceProfile(scenario);
  emit('parse', 'Proposing alternate strategy schemas...');
  let branches = [];
  try {
    branches = await proposeGenerativeBranches(scenario, evidence, emit);
  } catch (err) {
    console.error('[MemTrace Engine] Failed to propose branches:', err);
  }
  if (!branches || branches.length === 0) {
    branches = [
      { id: 'branch_1', title: 'Default Strategy', description: scenario.question }
    ];
  }
  scenario.branchCount = branches.length;

  emit('mesh_init', `Spawning ${agentCount} agents bound to graph factions...`);
  const agents = await generateMemTraceMesh(scenario, graph, simId, domain, agentCount);
  for (const agent of agents) {
    agent._initialBeliefs = JSON.parse(JSON.stringify(agent.beliefs));
  }
  await Promise.all(agents.map(a => saveAgent(a)));
  emit('mesh_init', `Mesh ready. exactly ${agents.length} persona profiles successfully bound.`);

  await createSimulation({ id: simId, uuid: input.uuid, scenario, agentCount, tickCount: maxRounds });

  const allEvents = [];
  let globalSummary = 'No previous debate has occurred. This is the beginning of the crisis.';
  let contestedClaim = null; // Dominant narrative label, updated each round
  let shockEvent = null;
  let totalEdges = graph.edges.length;
  const roundSummaries = []; // accumulated per-round shock + scenario info
  const previousShocks = [];

  for (let round = 1; round <= maxRounds; round++) {
    if (input.isCancelled?.()) throw new Error('Simulation Cancelled by user.');
    const roundStart = Date.now();
    emit('round_start', `Starting Round ${round} of ${maxRounds}...`, { round });

    // For Round 2 and above, introduce shock factors
    if (round >= 2) {
      emit('shock', `Round ${round}: Proposing unexpected variables/shock scenarios...`);
      shockEvent = await generateUnexpectedShock(scenario, domain, graph, round, previousShocks);
      if (shockEvent && shockEvent.id) previousShocks.push(shockEvent.id);
      emit('shock', `Round ${round} Shock Injected: "${shockEvent.title}" — ${shockEvent.description}`);
      
      // Update environment graph based on the shock
      applyShockToGraph(graph, shockEvent);
      
      // Upsert edges in database to represent the disruption
      const disruptedEdges = graph.edges.filter(e => e.status === 'DISRUPTED');
      for (const edge of disruptedEdges) {
        await upsertEdge({
          simId,
          srcAgent: edge.src,
          dstAgent: edge.dst,
          relType: edge.rel,
          weight: -0.9, // disrupted
          evidence: edge.evidence || shockEvent.description
        });
        totalEdges++;
      }
    }

    const roundEvents = [];
    const availablePosts = [];
    const now = () => new Date().toISOString();

    const activeAgents = [...agents];

    // Read configured parameters from cfg
    const numPostsPerAgent = cfg.num_posts_per_agent || 3;
    const postsExposedPerAgent = cfg.posts_exposed_per_agent || 2;
    const interactionCycles = cfg.interaction_cycles || 2;
    const targetInteractionsPerCycle = cfg.target_interactions_per_cycle || 15;

    emit('tick', `Round ${round}: Deliberating initial posts (${numPostsPerAgent} posts per agent)...`, { round });

    const batchSize = 5;
    for (let postIdx = 0; postIdx < numPostsPerAgent; postIdx++) {
      // Randomize execution order for each post generation batch to prevent order bias
      for (let i = activeAgents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [activeAgents[i], activeAgents[j]] = [activeAgents[j], activeAgents[i]];
      }

      for (let b = 0; b < activeAgents.length; b += batchSize) {
        const batch = activeAgents.slice(b, b + batchSize);
        const results = await Promise.all(
          batch.map(async (agent, batchIdx) => {
            if (agent.platforms && agent.platforms.length > 0) {
              agent.platform = agent.platforms[Math.floor(Math.random() * agent.platforms.length)];
            }
            const agentIndex = b + batchIdx;
            const totalActions = activeAgents.length * 3;
            const envString = getEnvironmentPromptString(round, maxRounds, agentIndex, totalActions, simId);
            const graphSummary = getGraphSummary(graph);
            const postContextStr = numPostsPerAgent > 1
              ? `\nThis is post ${postIdx + 1} of ${numPostsPerAgent} you are writing this round. Please ensure this post is unique, explores a different angle or part of the query/problem space, and does not repeat your other posts.`
              : '';

            const prompt = `/no_think
[CORE PERSONA]
You are ${agent.name} (${agent.pseudoName || ''}).
Platform: ${agent.platform}
Demographics: Age ${agent.age}, Gender ${agent.gender}, Region ${agent.region}
Backstory: ${(agent.backstory || '').slice(0, pl.backstory)}
Faction Node: ${agent.faction}

${envString}

[SCENARIO]
Question: "${scenario.question}"
Facts: ${(scenario.facts || []).slice(0, pl.factsCount).join(' | ').slice(0, pl.facts)}

[FACTUAL LANDSCAPE (GRAPH)]
${graphSummary}

[ROUND MEMORY]
${(globalSummary || 'First round.').slice(0, pl.globalSummary)}

[CONTESTED CLAIM]
${contestedClaim || 'None yet.'}

[YOUR LAST ACTION]
${agent.lastAction}

[SHOCK]
${shockEvent ? `${shockEvent.title}: ${shockEvent.description}` : 'None.'}

[INSTRUCTIONS]
Post on ${agent.platform}.${postContextStr}
${agent.platform === 'twitter' ? 'Under 280 chars.' : '2-3 sentences.'}
Output ONLY the post content. No intro, no quotes.`.trim();

            try {
              const response = await callLLM(prompt);
              const cleanPost = _cleanAndTruncatePost(response, agent.platform, cfg.tokenLimits);
              return { agent, content: cleanPost };
            } catch (e) {
              console.error(`[MemTrace Engine] Post generation failed for ${agent.name}:`, e.message);
              emit('tick', `[ERROR] Post generation failed for ${agent.name}: ${e.message}`);
              return { agent, content: null };
            }
          })
        );

        for (const { agent, content } of results) {
          if (!content) continue;
          const postId = randomUUID();
          const event = {
            id: postId,
            simId,
            tick: round,
            agentId: agent.id,
            agentName: agent.name,
            type: 'post',
            targetAgentId: null,
            targetInteractionId: null,
            content,
            platform: agent.platform,
            likes: 0,
            createdAt: now()
          };

          roundEvents.push(event);
          availablePosts.push(event);
          agent.recentPostIds.push(postId);
          if (agent.recentPostIds.length > 5) agent.recentPostIds.shift();
          agent.lastAction = `Posted on ${agent.platform}: "${content.slice(0, 60)}..."`;
          agent.roundHistory.push({ round, type: 'post', content });
        }
      }
    }

    emit('tick', `Round ${round}: Generating social interactions and cycles...`, { round });

    const agentExposed = {};
    for (const a of activeAgents) {
      agentExposed[a.id] = new Set();
    }

    const getInteractionsCount = () => roundEvents.filter(e => e.type !== 'post').length;

    for (let cycle = 1; cycle <= interactionCycles; cycle++) {
      if (getInteractionsCount() >= targetInteractionsPerCycle) {
        break;
      }

      // Build pairwise candidate pairs for this cycle
      const candidatePairs = [];
      for (const observer of activeAgents) {
        for (const poster of activeAgents) {
          if (poster.id === observer.id) continue;
          
          // Get poster's posts in this round that observer has NOT yet reacted to/ignored
          const posterPosts = availablePosts.filter(p => p.agentId === poster.id && p.type === 'post' && !agentExposed[observer.id].has(p.id));
          
          // Randomly select up to postsExposedPerAgent from them
          const shuffledPosts = [...posterPosts].sort(() => 0.5 - Math.random());
          const selectedPosts = shuffledPosts.slice(0, postsExposedPerAgent);
          
          for (const post of selectedPosts) {
            candidatePairs.push({ observer, post });
          }
        }
      }

      // Shuffle candidate pairs to prevent ordering bias
      const shuffledPairs = [...candidatePairs].sort(() => 0.5 - Math.random());

      for (const { observer, post } of shuffledPairs) {
        if (getInteractionsCount() >= targetInteractionsPerCycle) {
          break;
        }

        // Track that observer has been exposed to this post
        agentExposed[observer.id].add(post.id);

        // Enforce active platform alignment for the current interaction
        observer.platform = post.platform;

        const probs = await _classifyActionLikelihood(observer, post, scenario);
        const actionType = _sampleAction(probs);

        if (actionType === 'ignore') {
          console.log(`[Likelihood Engine] Agent ${observer.name} decided to IGNORE ${post.agentName}'s post.`);
          continue;
        }

        if (actionType === 'like') {
          post.likes += 1;
          const reactionEvent = {
            id: randomUUID(),
            simId,
            tick: round,
            agentId: observer.id,
            agentName: observer.name,
            type: 'like',
            targetAgentId: post.agentId,
            targetInteractionId: post.id,
            content: `Liked ${post.agentName}'s post.`,
            platform: post.platform,
            likes: 0,
            createdAt: now()
          };
          roundEvents.push(reactionEvent);
          observer.lastAction = `LIKE: Liked ${post.agentName}'s post`;
        } else if (actionType === 'follow') {
          const reactionEvent = {
            id: randomUUID(),
            simId,
            tick: round,
            agentId: observer.id,
            agentName: observer.name,
            type: 'follow',
            targetAgentId: post.agentId,
            targetInteractionId: post.id,
            content: `Followed ${post.agentName} for alignment.`,
            platform: post.platform,
            likes: 0,
            createdAt: now()
          };
          roundEvents.push(reactionEvent);
          observer.lastAction = `FOLLOW: Followed ${post.agentName}`;

          await upsertEdge({
            simId,
            srcAgent: observer.id,
            dstAgent: post.agentId,
            relType: 'follow',
            weight: 0.8,
            evidence: 'Followed for alignment'
          });
          totalEdges++;
        } else if (actionType === 'comment') {
          let content = '';
          let sentimentScore = null;
          let targetEdgeWeight = 0.4;

          try {
            const actionIndex = activeAgents.length + roundEvents.length;
            const totalActions = activeAgents.length * 3;
            const rawContent = await _generateWritingActionContent(
              observer,
              post,
              'comment',
              scenario,
              round,
              maxRounds,
              actionIndex,
              totalActions,
              simId,
              contestedClaim
            );
            content = _cleanAndTruncatePost(rawContent, observer.platform, cfg.tokenLimits);
            sentimentScore = await _scoreEdgeSentiment(content);
            if (sentimentScore.sentiment === 'positive') {
              targetEdgeWeight = Math.min(0.95, targetEdgeWeight + (sentimentScore.intensity ?? 0.5) * 0.3);
            } else if (sentimentScore.sentiment === 'negative') {
              targetEdgeWeight = Math.max(0.1, targetEdgeWeight - (sentimentScore.intensity ?? 0.5) * 0.3);
            }
          } catch (err) {
            console.error(`[MemTrace Engine] Comment generation failed for ${observer.name}:`, err.message);
            emit('tick', `[ERROR] Comment generation failed for ${observer.name}: ${err.message}`);
            post.likes += 1;
            content = `Liked ${post.agentName}'s post.`;
            sentimentScore = { sentiment: 'neutral', intensity: 0.5, agrees: null };
          }

          const reactionEvent = {
            id: randomUUID(),
            simId,
            tick: round,
            agentId: observer.id,
            agentName: observer.name,
            type: 'comment',
            targetAgentId: post.agentId,
            targetInteractionId: post.id,
            content,
            platform: post.platform,
            likes: 0,
            createdAt: now(),
            _sentiment: sentimentScore?.sentiment ?? null,
            _agrees:    sentimentScore?.agrees    ?? null
          };
          roundEvents.push(reactionEvent);
          observer.lastAction = `COMMENT: ${content.slice(0, 60)}`;

          if (sentimentScore && sentimentScore.sentiment === 'positive') {
            await upsertEdge({
              simId,
              srcAgent: observer.id,
              dstAgent: post.agentId,
              relType: 'comment',
              weight: targetEdgeWeight,
              evidence: content.slice(0, 120)
            });
            totalEdges++;
          }
        }
      }
    }

    allEvents.push(...roundEvents);

    // Apply heuristic belief updates based on round outcomes
    await _applyMemTraceBeliefs(activeAgents, roundEvents, graph, scenario);

    // Synthesize the state vector (Global Summary / Round Memory)
    emit('round_end', `Round ${round}: Synthesizing round-level Global Summary...`);
    globalSummary = await synthesizeRoundSummary(round, roundEvents, scenario);

    // Extract the dominant contested claim for the next round's agent prompts.
    // ~80 tokens in (the summary), ~25 tokens out. One call per round, not per agent.
    contestedClaim = await _extractContestedClaim(globalSummary);

    const duration = ((Date.now() - roundStart) / 1000).toFixed(1);
    emit('round_end', `Round ${round} Summary: "${globalSummary}"`, {
      round,
      duration,
      edgesCount: totalEdges,
      contestedClaim,
    });

    // Commit Round Summary and Knowledge Graph snapshot to SQLite
    await saveRoundSummary(simId, round, globalSummary, shockEvent, graph, input.uuid);

    // Commit Round Summary to MemTrace base (vector index)
    if (input.uuid && input.orchestrator) {
      const memtraceContent = `MemTrace Simulation Round ${round} Global Summary:
Scenario Question: ${scenario.question}
Global Summary: ${globalSummary}
Injected Shock: ${shockEvent ? `${shockEvent.title} - ${shockEvent.description}` : 'None (Control)'}`;
      
      try {
        await input.orchestrator.ingest(memtraceContent, `memtrace:run:${simId}:round:${round}`, input.uuid);
        console.log(`[MemTrace Engine] Ingested Round ${round} summary to MemTrace base.`);
      } catch (err) {
        console.error(`[MemTrace Engine] Failed to ingest Round ${round} summary:`, err);
      }
    }

    // Track this round's summary + shock for feed display
    roundSummaries.push({
      round,
      scenario: scenario.question,
      shockEvent: shockEvent ? { title: shockEvent.title, description: shockEvent.description, severity: shockEvent.severity } : null,
      summary: globalSummary,
      contestedClaim,
      duration
    });

    // Stochastic Seed check at the end of the round
    if (round < maxRounds) {
      const seed = simId.charCodeAt(0) + round * 31337;
      const rngValue = seededRandom(seed);
      if (rngValue > (cfg.shockThreshold || 0.72)) {
        emit('shock', `Stochastic threshold crossed (${rngValue.toFixed(3)} > ${cfg.shockThreshold || 0.72}). External shock triggered!`);
        applyShockToGraph(graph, { title: 'Stochastic Disturbance', description: 'A sudden, unplanned geopolitical disruption occurs in the network.' });
      }
    }
  }

  // Conduct post-simulation interviews using ReporterAgent
  const interviews = await conductInterviews(simId, agents, allEvents, scenario, branches, evidence, emit);

  // Persist final states & interactions
  emit('report', `Saving final simulation data and generating intelligence report...`);
  await addInteractionBatch(allEvents);
  await Promise.all(agents.map(a => saveAgent(a)));

  const report = await generateReport(simId, agents, allEvents, branches, scenario, evidence, interviews);
  await completeSimulation(simId, report);

  emit('mesh_done', `MemTrace Mesh complete. ${allEvents.length} events logged across ${maxRounds} rounds.`, { simId });

  return {
    id: simId,
    type: 'memtrace',
    domain,
    scenario,
    agentCount,
    rounds: maxRounds,
    agents,
    interactions: allEvents,
    graph,
    report,
    roundSummaries,
  };
}

/**
 * Strips think blocks, cleans quotes, and enforces platform lengths.
 */
function _cleanAndTruncatePost(text, platform, limits = {}) {
  let clean = String(text || '').trim();
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  clean = clean.replace(/^["']|["']$/g, '').trim();
  clean = clean.replace(/^(as\s+\w[\w_]+:|post:|reply:|response:)\s*/i, '');
  
  const limit = limits[platform] || limits.default || 250;
  if (clean.length > limit) {
    clean = clean.slice(0, limit).trimEnd();
    const lastPeriod = clean.lastIndexOf('.');
    if (lastPeriod > limit * 0.7) {
      clean = clean.slice(0, lastPeriod + 1);
    }
  }
  return clean;
}

/**
 * Apply belief nudges inside the MemTrace engine.
 *
 * Agreement direction comes from the `_agrees` field stamped on each reaction event
 * by _scoreEdgeSentiment (no extra LLM call). We no longer use keyword regex to
 * infer agreement — LLM-generated prose is too varied for that to be reliable.
 */
async function _applyMemTraceBeliefs(agents, events, graph, scenario) {
  const topics = (graph?.nodes || []).map(n => n.id);
  
  for (const agent of agents) {
    const observations = [];
    for (const event of events) {
      if (event.agentId === agent.id) continue;
 
      if (event.type === 'post' || event.type === 'comment' || event.type === 'quote' || event.type === 'reply') {
        const stances = {};
        const lower = event.content.toLowerCase();

        // Determine agreement direction from LLM sentiment score (stamped on the event)
        // _agrees is true (supportive), false (opposing), or null (non-writing / unknown)
        const agreeFlag = event._agrees;

        for (const t of topics) {
          const words = t.replace(/_/g, ' ').split(' ').filter(w => w.length >= 4);
          const hit = words.length > 0 && words.some(w => lower.includes(w));
          if (!hit) continue;

          let stanceVal;
          if (event.type === 'comment' || event.type === 'quote' || event.type === 'reply') {
            if (agreeFlag === false) {
              // Disagreeing comment: stance is opposed to the parent post's direction.
              // If the parent exists and is itself negative, disagreeing with it is positive.
              const parent = events.find(e => e.id === event.targetInteractionId);
              const parentAgrees = parent?._agrees;
              if (parentAgrees === false) {
                stanceVal = 0.8;  // disagreeing with a negative post → net positive
              } else {
                stanceVal = -0.8; // disagreeing with a neutral/positive post → net negative
              }
            } else if (agreeFlag === true) {
              stanceVal = 0.8;
            } else {
              stanceVal = 0.3; // neutral / unknown
            }
          } else {
            stanceVal = 0.8; // plain post treated as a positive stance signal
          }
          stances[t] = stanceVal;
        }
 
        observations.push({
          authorId:  event.agentId,
          stances,
          likeCount: event.likes || 0,
          type:      event.type,    // keep the real action type, never overwrite it
          sentiment: event._sentiment ?? null,
          agrees:    event._agrees   ?? null,
          argumentKey: event.content.slice(0, 60)
        });
      } else if (event.type === 'repost') {
        // Repost signals full endorsement of the original post's stance
        const origPost = events.find(e => e.id === event.targetInteractionId);
        if (origPost) {
          const stances = {};
          const lower = origPost.content.toLowerCase();
          for (const t of topics) {
            const words = t.replace(/_/g, ' ').split(' ').filter(w => w.length >= 4);
            const hit = words.length > 0 && words.some(w => lower.includes(w));
            if (hit) stances[t] = 0.8;
          }
          observations.push({
            authorId:    event.agentId,
            stances,
            likeCount:   0,
            type:        'repost',
            sentiment:   null,
            agrees:      true,
            argumentKey: origPost.content.slice(0, 60)
          });
        }
      } else if ((event.type === 'like' || event.type === 'follow') &&
                  event.targetAgentId === agent.id) {
        // Positive feedback on own post — only drives trust, no stance shift
        observations.push({
          authorId:    event.agentId,
          stances:     {},
          likeCount:   0,
          type:        event.type,
          sentiment:   'positive',
          agrees:      true,
          argumentKey: null
        });
      }
    }
 
    if (observations.length > 0) {
      const prevBeliefs = agent.beliefs;
      agent.beliefs = nudgeBeliefs(agent.beliefs, observations, {
        seenArguments: agent.seenArguments,
        persona:       agent,
        agentFaction:  agent.faction
      });
      
      // Decay memory slightly toward initial stance
      for (const topic of Object.keys(agent.beliefs.positions)) {
        const initial = agent._initialBeliefs?.positions?.[topic] || 0.0;
        const current = agent.beliefs.positions[topic];
        agent.beliefs.positions[topic] = current * (1 - agent.memoryDecay * 0.05) + initial * (agent.memoryDecay * 0.05);
      }
      
      const shifts = beliefDelta(prevBeliefs, agent.beliefs);
      if (shifts.length > 0) agent._lastShifts = shifts;
    }
  }
 
  // Apply cascading tipping points
  applyCascadeTippingPoints(agents);
  await evaluateDynamicFactionTipping(agents, graph, scenario);
}
 
// _classifyReaction removed: agreement direction is now derived from
// _scoreEdgeSentiment which returns {sentiment, intensity, agrees}.

async function _classifyActionLikelihood(reactor, postEvent, scenario) {
  if (!DEFAULT_CONFIG.apiKey) {
    return { like: 0.4, comment: 0.3, follow: 0.1, ignore: 0.2 };
  }
  const prompt = `Reactor: "${reactor.name}" backstory: "${reactor.backstory}" riskBias: ${reactor.riskBias}.
Post by ${postEvent.agentName}: "${postEvent.content}".
Topic: "${scenario.question}".

Predict reaction probabilities for the reactor. Return JSON only:
{"like": float, "comment": float, "follow": float, "ignore": float}
All values must sum to 1.0.`;

  try {
    const response = await callLLM(prompt);
    const clean = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const result = {
        like: parsed.like || 0,
        comment: parsed.comment || 0,
        follow: parsed.follow || 0,
        ignore: parsed.ignore || 0
      };
      const total = result.like + result.comment + result.follow + result.ignore;
      if (total > 0) {
        result.like /= total;
        result.comment /= total;
        result.follow /= total;
        result.ignore /= total;
      } else {
        return { like: 0.4, comment: 0.3, follow: 0.1, ignore: 0.2 };
      }
      return result;
    }
  } catch (e) {
    console.warn(`[Likelihood Engine] Failed for ${reactor.name}:`, e.message);
  }
  return { like: 0.4, comment: 0.3, follow: 0.1, ignore: 0.2 };
}

function _sampleAction(probs) {
  const rand = Math.random();
  let sum = 0;
  for (const [action, p] of Object.entries(probs)) {
    sum += p;
    if (rand <= sum) return action;
  }
  return 'like';
}

async function _generateWritingActionContent(reactor, postEvent, actionType, scenario, round, maxRounds, actionIndex, totalActions, simId, contestedClaim) {
  const pl = DEFAULT_CONFIG.promptLimits;
  const envString = getEnvironmentPromptString(round, maxRounds, actionIndex, totalActions, simId);
  const prompt = `/no_think
You are ${reactor.name} (${reactor.pseudoName || ''}) on ${reactor.platform}.
Backstory: ${(reactor.backstory || '').slice(0, pl.backstory)}
${envString}
Topic: "${scenario.question}"
Facts: ${(scenario.facts || []).slice(0, pl.factsCount).join(' | ').slice(0, pl.facts)}

[CONTESTED CLAIM]
${contestedClaim || 'None yet.'}

${actionType.toUpperCase()} this post by ${postEvent.agentName}:
"${postEvent.content.slice(0, pl.postContent)}"

Write your reply in character. Output text ONLY. No JSON, no quotes.`;

  const response = await callLLM(prompt);
  return String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Zero-shot sentiment + agreement classifier (~20-30 token output).
 * Returns {sentiment, intensity, agrees} — agrees=true means the author
 * is endorsing the post they are reacting to, false means opposing it.
 * This replaces the old keyword-regex _classifyReaction entirely.
 */
async function _scoreEdgeSentiment(content) {
  if (!content || !DEFAULT_CONFIG.apiKey) {
    return { sentiment: 'neutral', intensity: 0.5, agrees: null };
  }
  const prompt = `Analyze this social media comment:
"${content}"

Return JSON only:
{"sentiment": "negative" | "positive" | "neutral", "intensity": float, "agrees": true | false}`;

  try {
    const response = await callLLM(prompt);
    const clean = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      // Ensure agrees is a boolean or null, never undefined
      if (parsed.agrees !== true && parsed.agrees !== false) parsed.agrees = null;
      return parsed;
    }
  } catch (err) {
    console.warn('[Sentiment Scoring] Failed:', err.message);
  }
  return { sentiment: 'neutral', intensity: 0.5, agrees: null };
}
