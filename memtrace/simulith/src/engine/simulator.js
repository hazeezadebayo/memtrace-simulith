import { buildEvidenceProfile } from '../data/evidence.js';
import { generatePersonas, simulatePersonaReaction } from '../agents/personas.js';
import { buildBranches } from '../data/manifest.js';
import { scoreBranches } from './scoring.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

function cleanLine(line) {
  return String(line || '')
    .replace(/^[\-\*\u2022\d.)\s]+/, '')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addLog(logs, emit, stage, message, details = {}) {
  const entry = { stage, message, details, at: new Date().toISOString() };
  logs.push(entry);
  emit(stage, message, details);
}

export function parseScenario(input = {}) {
  // Gracefully merge legacy input.sources into facts if they exist
  const legacySources = Array.isArray(input.sources) ? input.sources.map(s => typeof s === 'string' ? s : (s.text || s.url || '')).filter(Boolean) : [];
  const facts = Array.isArray(input.facts) ? input.facts.map(cleanLine).concat(legacySources).filter(Boolean) : legacySources;
  
  return {
    question: String(input.question || input.prompt || '').trim(),
    facts,
    customPersonas: Array.isArray(input.customPersonas) ? input.customPersonas.map(cleanLine).filter(Boolean) : (typeof input.customPersonas === 'string' && input.customPersonas.trim() ? [cleanLine(input.customPersonas)] : []),
    domain: String(input.domain || 'general').trim() || 'general',
    audience: String(input.audience || 'general').trim() || 'general',
    branchCount: Number.isFinite(Number(input.branchCount)) ? Number(input.branchCount) : 4,
    personaCount: Number.isFinite(Number(input.personaCount)) ? Number(input.personaCount) : 4,
    weights: input.weights || {},
    personaTweaks: Array.isArray(input.personaTweaks) ? input.personaTweaks : [],
    runLabel: String(input.runLabel || '').trim()
  };
}

export async function simulateScenario(input = {}, state = {}, emit = () => {}) {
  const logs = [];
  const scenario = parseScenario(input);

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urlsToCrawl = new Set();
  
  scenario.facts.forEach(text => {
    const matches = text.match(urlRegex);
    if (matches) matches.forEach(m => urlsToCrawl.add(m));
  });

  if (urlsToCrawl.size > 0) {
    addLog(logs, emit, 'crawl', `Crawling ${urlsToCrawl.size} URLs for context...`);
    const { crawlWebsite } = await import('../utils/crawler.js');
    for (const url of urlsToCrawl) {
      try {
        const pages = await crawlWebsite(url, 3);
        if (pages.length > 0) {
          scenario.facts.push(`Extracted from ${url}: ${pages[0].substring(0, 2000)}...`);
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
        addLog(logs, emit, 'crawl_error', `Failed to crawl ${url}`);
      }
    }
  }

  const { determineDomainAndAudience, proposeGenerativeBranches, proposeGenerativePersonas, proposeGenerativeReactions } = await import('../agents/generative.js');

  addLog(logs, emit, 'classify', 'Determining domain and audience dynamically...');
  const classification = await determineDomainAndAudience(scenario.question, scenario.facts);
  if (!scenario.domain || scenario.domain === 'general') {
    scenario.domain = classification.domain;
  }
  
  const { normalizeToBranchDomain } = await import('../graph/domain_matcher.js');
  scenario.domain = await normalizeToBranchDomain(scenario.domain);
  if (!scenario.audience || scenario.audience === 'general') {
    scenario.audience = classification.audience;
  }

  addLog(logs, emit, 'parse', 'Question parsed.', {
    domain: scenario.domain,
    audience: scenario.audience,
    branchCount: scenario.branchCount,
    personaCount: scenario.personaCount
  });
  await sleep(25);

  const evidence = await buildEvidenceProfile(scenario);
  addLog(logs, emit, 'evidence', 'Evidence profile built.', {
    sources: evidence.summary.sourceCount,
    facts: evidence.summary.factCount,
    support: evidence.summary.support,
    risk: evidence.summary.risk,
    contradictionCount: evidence.summary.contradictionCount
  });
  await sleep(25);

  let personas = generatePersonas(scenario, evidence, state, scenario.personaCount);
  for (const tweak of scenario.personaTweaks) {
    const target = personas.find(persona => persona.id === tweak.id);
    if (target) {
      if (tweak.riskBias !== undefined) target.riskBias = Number(tweak.riskBias);
      if (tweak.evidenceDemand !== undefined) target.evidenceDemand = Number(tweak.evidenceDemand);
      if (tweak.clarityNeed !== undefined) target.clarityNeed = Number(tweak.clarityNeed);
      if (tweak.noveltySeek !== undefined) target.noveltySeek = Number(tweak.noveltySeek);
      if (tweak.note) target.note = String(tweak.note);
      if (tweak.name) target.name = String(tweak.name);
      target.cluster = target.riskBias >= 0.75 || target.evidenceDemand >= 0.8 ? 'skeptical' : target.noveltySeek >= 0.7 && target.riskBias <= 0.45 ? 'expansive' : 'balanced';
    }
  }

  addLog(logs, emit, 'population', 'Population seeded.', {
    personas: personas.map(persona => ({ id: persona.id, name: persona.name, cluster: persona.cluster, note: persona.note }))
  });
  await sleep(25);

  const preGraph = {
    items: evidence.tensions.map(item => ({ ...item, evidence: item.why, severity: 1 })),
    summary: {
      strongestLabel: evidence.tensions[0]?.label || 'none',
      headline: evidence.tensions.length ? `${evidence.tensions.length} pressure points found` : 'No strong pressure points',
      details: evidence.tensions.map(item => item.label).join(', ')
    },
    nodes: []
  };
  addLog(logs, emit, 'graph', 'Initial tension map drafted.', { tensions: preGraph.items.length });
  await sleep(20);

  const fallbackBranches = buildBranches(scenario, personas, evidence, state.settings || {});
  
  // CORE V7: Generative Injection (Parallelized)
  if (input.isCancelled?.()) throw new Error('Simulation Cancelled by user.');
  
  const resolvedCustomPersonas = [];
  if (scenario.customPersonas && scenario.customPersonas.length > 0) {
    addLog(logs, emit, 'generative', `Generating ${scenario.customPersonas.length} custom personas from descriptions...`);
    const { generateCustomPersonaFromDescription } = await import('../agents/generative.js');
    const results = await Promise.all(
      scenario.customPersonas.map(desc => generateCustomPersonaFromDescription(desc).catch(e => {
        if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
        addLog(logs, emit, 'generative_error', `Failed to generate custom persona: ${e.message}`);
        return null;
      }))
    );
    resolvedCustomPersonas.push(...results.filter(Boolean));
  }

  const [genBranches, genPersonas] = await Promise.all([
    proposeGenerativeBranches(scenario, evidence, emit),
    proposeGenerativePersonas(scenario, evidence, personas, emit, [...(state.customPersonas || []), ...resolvedCustomPersonas])
  ]);

  let finalBranches = fallbackBranches;
  if (genBranches.length > 0) {
    addLog(logs, emit, 'generative', `Injected ${genBranches.length} custom branches.`, { titles: genBranches.map(b => b.title) });
    // Completely replace heuristic fallbacks to ensure dynamic outcomes
    finalBranches = genBranches.map((b, i) => ({ ...b, id: `gen-branch-${i + 1}`, intensity: 5 }));
  } else {
    addLog(logs, emit, 'generative_error', `LLM branch generation failed. Using generic fallback branches.`);
  }

  if (genPersonas.length > 0) {
    const { pickCluster, personaNote, responseTone } = await import('../agents/personas.js');
    addLog(logs, emit, 'generative', `Injected ${genPersonas.length} custom personas.`, { names: genPersonas.map(p => p.name) });
    const generated = [];
    genPersonas.forEach((p, i) => {
      const riskBias      = typeof p.riskBias      === 'number' ? p.riskBias      : 0.5;
      const evidenceDemand= typeof p.evidenceDemand=== 'number' ? p.evidenceDemand: 0.5;

      // Derive noveltySeek: high-risk takers naturally seek novelty; inverse of evidenceDemand
      // Formula: novelty = (1 - riskBias) * 0.6 + (1 - evidenceDemand) * 0.4
      // → risk taker (low riskBias) + intuition-driven (low evidenceDemand) = high noveltySeek
      const noveltySeek = Math.min(1, Math.max(0,
        (1 - riskBias) * 0.6 + (1 - evidenceDemand) * 0.4
      ));

      // Derive clarityNeed: high evidence demand correlates with needing clarity
      // A contrarian or intuitive reasoner needs less structure
      const reasoningStyleBonus = {
        'data-driven': 0.15, 'systemic': 0.10, 'historical': 0.05,
        'ethical': 0.05,     'financial': 0.10, 'operational': 0.08,
        'contrarian': -0.10, 'intuitive': -0.12
      }[p.reasoningStyle] ?? 0;
      const clarityNeed = Math.min(1, Math.max(0,
        evidenceDemand * 0.75 + (1 - noveltySeek) * 0.25 + reasoningStyleBonus
      ));

      // Reliability starts at 0.5 (neutral) — it will evolve via wins/losses over time.
      // There is no better prior here without simulation history.
      const reliability = 0.5;

      const persona = {
        ...p,
        id: `gen-persona-${i + 1}`,
        reliability,
        wins: 0,
        losses: 0,
        lens: p.bio || 'Custom Perspective',
        riskBias,
        evidenceDemand,
        noveltySeek,
        clarityNeed
      };
      persona.cluster = pickCluster(persona);
      persona.note = personaNote(persona, evidence);
      persona.backstory = persona.backstory || p.bio || 'Expert';
      persona.responseTone = responseTone(persona, evidence);
      generated.push(persona);
    });
    personas = generated;
  } else {
    addLog(logs, emit, 'generative_error', `LLM persona generation failed. Using generic fallbacks.`);
  }

  addLog(logs, emit, 'branches', 'Branch pool built.', { branchCount: finalBranches.length });
  await sleep(25);

  const branchGraph = {
    items: evidence.tensions.map(item => ({
      ...item,
      evidence: item.why,
      severity: 1
    })),
    summary: {
      strongestLabel: evidence.tensions[0]?.label || 'none',
      headline: evidence.tensions.length ? `${evidence.tensions.length} pressure points found` : 'No strong pressure points',
      details: evidence.tensions.map(item => item.label).join(', ')
    }
  };

  const { conductCrossExamination } = await import('../agents/generative.js');

  const rawPopulation = [];
  for (const persona of personas) {
    if (input.isCancelled?.()) throw new Error('Simulation Cancelled by user.');
    // Collect existing reactions from other personas to avoid repeating points/groupthink
    const existingReactions = rawPopulation.map(p => ({
      persona: p.name,
      reactions: p.reactions.map(r => ({ branch: r.branch, stance: r.stance, argument: r.text }))
    }));
    const reactions = await proposeGenerativeReactions(persona, finalBranches, scenario, evidence, existingReactions);
    rawPopulation.push({ ...persona, reactions });
  }

  // True Cross-Examination: Subject every persona to ONE targeted Judge question
  const populationReaction = [];
  for (const personaWithReactions of rawPopulation) {
    // Pick the branch to cross examine. Prefer 'support' or 'push back' over 'wait'.
    let targetReaction = personaWithReactions.reactions.find(r => r.stance !== 'wait') || personaWithReactions.reactions[0];
    if (!targetReaction) {
      populationReaction.push(personaWithReactions);
      continue;
    }

    const branch = finalBranches.find(b => b.id === targetReaction.branchId);
    if (!branch) {
      populationReaction.push(personaWithReactions);
      continue;
    }
    
    // Conduct the cross examination
    const interviewed = await conductCrossExamination(personaWithReactions, branch, scenario, targetReaction);
    
    // Update the specific reaction in their array
    const resolvedReactions = personaWithReactions.reactions.map(r => {
      if (r.branchId === branch.id) {
        return { ...r, stance: interviewed.stance, text: interviewed.personaResponse };
      }
      return r;
    });

    // Emit the interview transcript so the UI can render it
    addLog(logs, emit, 'interview', `${personaWithReactions.name} cross-examined on "${branch.title}"`, {
      personaName:       personaWithReactions.name,
      branchTitle:       branch.title,
      branchId:          branch.id,
      judgeQuestion:     interviewed.judgeQuestion,
      personaResponse:   interviewed.personaResponse,
      finalStance:       interviewed.stance
    });

    populationReaction.push({ ...personaWithReactions, reactions: resolvedReactions });
  }

  const scoredBranches = scoreBranches(finalBranches, scenario, evidence, branchGraph, populationReaction, state.settings || {});
  
  addLog(logs, emit, 'contradictions', 'Contradiction graph finalized.', {
    tensions: branchGraph.items.length,
    topTension: branchGraph.summary.strongestLabel
  });
  await sleep(20);

  addLog(logs, emit, 'score', 'Branch scoring complete.', {
    best: scoredBranches[0]?.title,
    score: scoredBranches[0]?.score,
    confidence: scoredBranches[0]?.confidence
  });

  const recommendation = scoredBranches[0];

  addLog(logs, emit, 'brief', 'Drafting executive brief...');
  const { generateExecutiveBrief, generateCounterfactuals } = await import('../agents/generative.js');
  const brief = await generateExecutiveBrief(scenario, recommendation, emit);
  if (brief.executiveBrief.includes('Proceed with this branch as the optimal path based on available evidence')) {
    addLog(logs, emit, 'brief_error', 'LLM failed to generate brief. Using generic fallback.');
  } else {
    addLog(logs, emit, 'brief_success', 'Executive brief drafted successfully.');
  }

  addLog(logs, emit, 'counterfactuals', 'Simulating counterfactual realities...');
  const counterfactuals = await generateCounterfactuals(scenario, scoredBranches);
  addLog(logs, emit, 'counterfactuals_success', 'Counterfactual Engine executed.');

  const domainStats = state.outcomeStats?.byDomain?.[scenario.domain] || { wins: 0, losses: 0 };
  const totalDomainRuns = (domainStats.wins || 0) + (domainStats.losses || 0);
  const learningSummary = totalDomainRuns > 0 
    ? `Influenced by ${totalDomainRuns} past runs in ${scenario.domain} domain.`
    : 'No past domain data; using base heuristics.';

  return {
    id: `run-${Date.now()}`,
    scenario,
    evidence,
    learningSummary,
    population: {
      size: personas.length,
      label: `${personas.length} simulated perspectives`,
      personas: populationReaction
    },
    contradictionGraph: branchGraph,
    branches: scoredBranches,
    timeline: logs,
    counterfactuals,
    recommendation: {
      branchId: recommendation.id,
      title: recommendation.title,
      reason: brief.executiveBrief || recommendation.why.join(' '),
      whatWouldChangeMyMind: brief.councilalFactor || recommendation.counterfactuals[0] || 'Need stronger evidence.'
    }
  };
}

/* ==================================================================
   simulateMesh — True Multi-Agent Mesh Intelligence
   Spawns N platform-native agents with persistent BeliefState,
   runs T ticks of LLM-driven conversation, updates beliefs via
   the heuristic nudge formula, returns a full intelligence report.
   ================================================================== */
export async function simulateMesh(input = {}, emit = () => {}) {
  const { randomUUID } = await import('node:crypto');
  const { generateMesh } = await import('../agents/mesh.js');
  const { runTick } = await import('./tick_engine.js');
  const { generateReport } = await import('./report_generator.js');
  const {
    createSimulation, completeSimulation,
    saveAgent, getSimInteractions, getSimAgents, getSimEdges, upsertEdge
  } = await import('../db/agent_memory.js');

  const simId = randomUUID();
  const limits = DEFAULT_CONFIG.LIMITS.mesh;
  const agentCount = Math.max(limits.minAgents, Math.min(limits.maxAgents, Number(input.agentCount)));
  const tickCount  = Math.max(limits.minTicks, Math.min(limits.maxTicks, Number(input.tickCount)));

  const scenario = {
    question: String(input.question || input.prompt || '').trim(),
    facts:    Array.isArray(input.facts)   ? input.facts.filter(Boolean)   : [],
    customPersonas: Array.isArray(input.customPersonas) ? input.customPersonas.filter(Boolean) : [],
    domain:   String(input.domain   || 'general').trim(),
    audience: String(input.audience || 'general').trim(),
    maxTicks: tickCount,
  };

  const { determineDomainAndAudience } = await import('../agents/generative.js');
  emit('classify', 'Determining domain and audience dynamically...');
  let classification = { domain: 'general', audience: 'general' };
  try {
    classification = await determineDomainAndAudience(scenario.question, scenario.facts);
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
    console.error('Failed to classify domain/audience:', err);
  }
  const { normalizeMemTraceDomain } = await import('../agents/memtrace_mesh.js');
  const canonicalDomain = await normalizeMemTraceDomain(classification.domain);
  scenario.domain = canonicalDomain || 'COMMON';
  scenario.audience = classification.audience;

  emit('parse', `Question classified matched with ${scenario.domain} domain.`, {
    domain: scenario.domain,
    audience: scenario.audience
  });

  emit('mesh_init', `Spawning ${agentCount} agents for mesh simulation...`, { simId, agentCount, tickCount });

  await createSimulation({ id: simId, uuid: input.uuid, scenario, agentCount, tickCount });

  const { buildEvidenceProfile } = await import('../data/evidence.js');
  const { buildScenarioGraph } = await import('../graph/graph_ontology.js');
  const { proposeGenerativeBranches } = await import('../agents/generative.js');

  const evidence = await buildEvidenceProfile(scenario);
  const graph = await buildScenarioGraph(scenario);

  emit('parse', 'Proposing alternate strategy schemas...');
  let branches = [];
  try {
    branches = await proposeGenerativeBranches(scenario, evidence, emit);
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
    console.error('Failed to propose branches:', err);
  }
  if (!branches || branches.length < 2) {
    branches = [
      { id: 'branch_1', title: 'Maintain Trajectory', description: `Continue with the current approach for: ${scenario.question}`, action: 'Observe and collect further feedback.', fitTags: ['control'] },
      { id: 'branch_2', title: 'Defensive Mitigation', description: 'Implement risk mitigation protocols to protect core systems.', action: 'Limit exposure and run validation tests.', fitTags: ['mitigate'] }
    ];
  }
  scenario.branchCount = branches.length;

  const uniqueSchemaTypes = new Set(graph.nodes.map(n => n.type));

  emit('parse', `Knowledge Graph built: ${graph.nodes.length} Nodes, ${graph.edges.length} Edges, ${uniqueSchemaTypes.size} Schema Types.`, {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    schemaTypes: Array.from(uniqueSchemaTypes),
    branches: branches.map(b => b.title)
  });

  const resolvedCustomPersonas = [];
  if (scenario.customPersonas && scenario.customPersonas.length > 0) {
    emit('mesh_init', `Generating ${scenario.customPersonas.length} custom personas from descriptions...`);
    const { generateCustomPersonaFromDescription } = await import('../agents/generative.js');
    const results = await Promise.all(
      scenario.customPersonas.map(desc => generateCustomPersonaFromDescription(desc).catch(e => {
        if (e.name === 'AbortError' || e.message === 'Simulation Cancelled by user.') throw e;
        console.error(`Failed to generate custom persona: ${e.message}`);
        return null;
      }))
    );
    resolvedCustomPersonas.push(...results.filter(Boolean));
  }

  const agents = await generateMesh(scenario, simId, agentCount, graph, resolvedCustomPersonas);
  for (const agent of agents) {
    agent._initialBeliefs = JSON.parse(JSON.stringify(agent.beliefs));
  }
  await Promise.all(agents.map(a => saveAgent(a)));

  // Overwrite the "ACTIVE SCHEMA" in the UI with the actual semantic topics extracted for the mesh.
  // This is much more realistic/insightful than just showing generic graph node types.
  if (scenario.topics && scenario.topics.length > 0) {
    emit('parse', `Mesh topics extracted successfully.`, {
      schemaTypes: scenario.topics
    });
  }

  emit('mesh_init', `Mesh ready. ${agents.length} agents across twitter, reddit, hn, discord, market.`, {
    agents: agents.map(a => ({ id: a.id, name: a.name, platform: a.platform, cluster: a.cluster }))
  });

  const { generateUnexpectedShock, synthesizeRoundSummary } = await import('./memtrace_engine.js');
  const { applyShockToGraph } = await import('../graph/knowledge_graph.js');

  const allInteractions = [];
  let totalEdges = 0;
  
  let globalSummary = 'No previous debate has occurred. This is the beginning of the crisis.';
  let shockEvent = null;
  const roundSummaries = [];
  const previousShocks = [];

  for (let tick = 1; tick <= tickCount; tick++) {
    if (input.isCancelled?.()) throw new Error('Simulation Cancelled by user.');
    const tickStart = Date.now();
    
    // Shock Timing: 1=None, 2=Negative, 3=Positive, 4=None, 5=Negative...
    if (tick % 3 !== 1) {
      emit('shock', `Tick ${tick}: Proposing unexpected variables/shock scenarios...`);
      shockEvent = await generateUnexpectedShock(scenario, scenario.domain, graph, tick, previousShocks);
      emit('shock', `Tick ${tick} Shock Injected: "${shockEvent.title}" — ${shockEvent.description}`);
      
      applyShockToGraph(graph, shockEvent);
      
      const disruptedEdges = graph.edges.filter(e => e.status === 'DISRUPTED');
      for (const edge of disruptedEdges) {
        await upsertEdge({
          simId,
          srcAgent: edge.src,
          dstAgent: edge.dst,
          relType: edge.rel,
          weight: -0.9,
          evidence: edge.evidence || shockEvent.description
        });
        totalEdges++;
      }
      if (shockEvent && shockEvent.id) previousShocks.push(shockEvent.id);
    } else {
      shockEvent = null;
      if (tick > 1) {
        emit('shock', `Tick ${tick}: No shock injected — control trajectory.`);
      }
    }

    const tickEvents = await runTick(simId, agents, tick, scenario, emit, graph, branches, globalSummary, shockEvent);
    
    emit('tick_end', `Tick ${tick}: Synthesizing round-level Global Summary...`);
    globalSummary = await synthesizeRoundSummary(tick, tickEvents, scenario);
    
    const duration = ((Date.now() - tickStart) / 1000).toFixed(1);
    const tickReactionsCount = tickEvents.filter(e => e.type !== 'post').length;
    totalEdges += tickReactionsCount;

    emit('tick_end', `Tick ${tick} completed in ${duration}s. Summary: "${globalSummary}"`, {
      tick,
      duration,
      edgesCount: totalEdges
    });
    
    roundSummaries.push({
      round: tick,
      scenario: scenario.question,
      shockEvent: shockEvent ? { title: shockEvent.title, description: shockEvent.description } : null,
      summary: globalSummary,
      duration
    });

    allInteractions.push(...tickEvents);
  }

  const { conductInterviews } = await import('../agents/interview.js');
  const interviews = await conductInterviews(simId, agents, allInteractions, scenario, branches, evidence, emit);

  emit('report', 'Generating intelligence report...', {});
  const report = await generateReport(simId, agents, allInteractions, branches, scenario, evidence, interviews);
  await completeSimulation(simId, report);

  const [dbAgents, dbInteractions, dbEdges] = await Promise.all([
    getSimAgents(simId),
    getSimInteractions(simId, 500),
    getSimEdges(simId),
  ]);

  emit('mesh_done', `Mesh complete. ${allInteractions.length} interactions across ${tickCount} ticks.`, { simId });

    // Calculate actual relationship edges based on final belief alignment
    const relationalEdges = [];
    for (let i = 0; i < dbAgents.length; i++) {
      for (let j = i + 1; j < dbAgents.length; j++) {
        const a = dbAgents[i];
        const b = dbAgents[j];
        
        let similarity = 0;
        let sharedKeys = 0;
        for (const key of Object.keys(a.beliefs || {})) {
          if (b.beliefs && b.beliefs[key] !== undefined) {
            const diff = Math.abs(a.beliefs[key] - b.beliefs[key]);
            similarity += (1 - diff);
            sharedKeys++;
          }
        }
        
        if (sharedKeys > 0) {
          const avgSim = similarity / sharedKeys;
          if (Math.abs(avgSim) > 0.1) {
            relationalEdges.push({
              src_agent: a.id,
              dst_agent: b.id,
              rel_type: avgSim > 0 ? 'aligned' : 'clashed',
              weight: avgSim,
              evidence: `Belief alignment score: ${avgSim.toFixed(2)}`
            });
          }
        }
      }
    }

    const finalEdges = relationalEdges.length > 0 ? relationalEdges : dbEdges;

    return {
      id:           simId,
      type:         'mesh',
      scenario,
      agentCount,
      tickCount,
      agents:       dbAgents,
      interactions: dbInteractions,
      graph: {
        nodes: dbAgents.map(a => ({
          id:       a.id,
          name:     a.name,
          platform: a.platform,
          platforms: a.platforms,
          cluster:  a.cluster,
          beliefs:  a.beliefs,
        })),
        edges: finalEdges,
      },
    scenarioGraph: {
      nodes: graph.nodes,
      edges: graph.edges,
    },
    report,
    roundSummaries,
    timeline: allInteractions.slice(0, 50).map(e => ({
      tick:      e.tick,
      agentName: e.agent_name || e.agentName,
      type:      e.type,
      content:   (e.content || '').slice(0, 120),
      platform:  e.platform,
    })),
  };
}
