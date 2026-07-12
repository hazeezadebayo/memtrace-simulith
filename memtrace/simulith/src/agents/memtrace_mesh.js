/* ==================================================================
   simulith/src/memtrace_mesh.js
   Spawns exactly agentCount agents bound to Knowledge Graph factions and
   highly specialized domain archetypes.
   ================================================================== */

import { randomUUID } from 'node:crypto';
import { MEMTRACE_DOMAINS, CANONICAL_DOMAINS, SPECIFIC_DOMAINS, PSEUDO_ARCHETYPES } from '../data/manifest.js';
import { createBeliefState, slugify } from './belief_state.js';
import { callLLM } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { getBestCosineMatch } from '../graph/domain_matcher.js';
import { clusterFromPersona } from '../utils/council_utils.js';

/**
 * Extract topics from scenario facts + knowledge graph.
 */
export function extractMemTraceTopics(scenario, graph) {
  const nodeNames = (graph?.nodes || []).map(n => n.label);
  const factWords = [scenario.question, ...(scenario.facts || []), ...nodeNames].join(' ');
  const raw = factWords
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4);

  const freq = {};
  for (const w of raw) freq[w] = (freq[w] || 0) + 1;

  const extracted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => slugify(w));

  // Also include graph nodes as topics to ground them
  const nodeTopics = (graph?.nodes || []).map(n => slugify(n.id));
  return Array.from(new Set([...extracted, ...nodeTopics]));
}


/**
 * Normalize dynamically classified domains into one of the canonical MemTrace domains.
 */
export async function normalizeMemTraceDomain(domain) {
  if (!domain) return null;
  const raw = String(domain).toLowerCase().trim();

  // Direct canonical match check
  const canonicalUpperCase = CANONICAL_DOMAINS.map(d => d.toUpperCase());
  if (canonicalUpperCase.includes(raw.toUpperCase())) return raw.toUpperCase();

  // Cosine similarity matching via local embeddings (Xenova)
  const bestMatch = await getBestCosineMatch(raw, canonicalUpperCase, 0.15);
  if (bestMatch) return bestMatch;

  return null;
}


/**
 * Generate agents for the MemTrace simulation.
 *
 * @param {object} scenario - { question, facts }
 * @param {object} graph - KnowledgeGraph object
 * @param {string} simId - simulation UUID
 * @param {string} domain - classified domain (SOCIETAL, BUSINESS, etc.)
 * @param {number} agentCount - number of agents to generate (default 15)
 * @returns {Promise<Array<object>>} - array of agent objects
 */
export async function generateMemTraceMesh(scenario, graph, simId, domain = 'SOCIETAL', agentCount = 15) {
  // Normalize domain name to match archetypes
  const domKey = await normalizeMemTraceDomain(domain) || 'SOCIETAL';
  
  // Dynamically assemble the pool of agentCount archetypes with a strict 1:9 ratio:
  // 1 out of every 10 is from PSEUDO_ARCHETYPES, and 9 from SPECIFIC_DOMAINS of the domain.
  const pool = [];
  const getShuffled = (arr) => [...arr].sort(() => Math.random() - 0.5);
  
  let currentPseudos = getShuffled(PSEUDO_ARCHETYPES);
  let currentSpecifics = getShuffled(SPECIFIC_DOMAINS[domKey] || SPECIFIC_DOMAINS.SOCIETAL);
  
  for (let i = 0; i < agentCount; i++) {
    if (i % 10 === 0) {
      if (currentPseudos.length === 0) {
        currentPseudos = getShuffled(PSEUDO_ARCHETYPES);
      }
      pool.push(currentPseudos.pop());
    } else {
      if (currentSpecifics.length === 0) {
        currentSpecifics = getShuffled(SPECIFIC_DOMAINS[domKey] || SPECIFIC_DOMAINS.SOCIETAL);
      }
      pool.push(currentSpecifics.pop());
    }
  }

  const topics = extractMemTraceTopics(scenario, graph);
  const agents = [];
 
  // Try LLM tailoring first if key exists
  const tailoredMapping = [];
  if (DEFAULT_CONFIG.apiKey) {
    try {
      const nodesSummary = (graph?.nodes || []).map(n => `- ${n.label} (Type: ${n.type}, ID: ${n.id})`).join('\n');
      const batchSize = 5;
      
      for (let offset = 0; offset < agentCount; offset += batchSize) {
        const batchPool = pool.slice(offset, offset + batchSize);
        const archetypesText = batchPool.map((a, idx) => `${offset + idx + 1}. Name: ${a.name}, Backstory: ${a.backstory}, Base Faction: ${a.faction}, Demographics: Age ${a.age}, Gender ${a.gender}, Region ${a.region}`).join('\n');
        
        const prompt = `/no_think
Choose the most appropriate faction node from the graph for each of the following ${batchPool.length} agents (numbered ${offset + 1} to ${offset + batchPool.length}) and tailor their details to fit this specific scenario:
Scenario/Question: "${scenario.question}"
Facts: ${(scenario.facts || []).join(', ')}

Faction Nodes:
${nodesSummary}

Base Archetypes:
${archetypesText}

Return a valid JSON array of exactly ${batchPool.length} objects:
[
  {
    "index": <index_from_archetype_above>,
    "name": "TailoredName",
    "backstory": "Concise backstory (max 2 sentences) including their role and bias regarding their faction.",
    "faction": "Chosen Faction Node ID",
    "age": 28,
    "gender": "Female" | "Male" | "Non-binary",
    "pseudoName": "@handle_name",
    "region": "Continent or Country"
  }
]
Return ONLY the raw JSON array. Do not use markdown wrappers, no explanation.`;

        const response = await callLLM(prompt);

        const clean = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const match = clean.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            for (let j = 0; j < parsed.length; j++) {
              const item = parsed[j];
              const parsedIdx = (item.index !== undefined) ? Number(item.index) - 1 : (offset + j);
              tailoredMapping[parsedIdx] = item;
            }
          }
        } else {
          console.warn(`[MemTrace Mesh] No JSON array match found in batch response starting at offset ${offset}. Response was:\n${clean}`);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
      console.error('[MemTrace Mesh] LLM persona tailoring failed:', err);
    }
  }
     
      // Spawn exactly agentCount agents
      for (let i = 0; i < agentCount; i++) {
        const archetype = pool[i];
     
        // Bind to a faction node from the knowledge graph if type matches
        let name = `${archetype.name}_${i + 1}`;
        let backstory = archetype.backstory;
        let faction = archetype.faction;
        let boundNode = null;
     
        if (tailoredMapping && tailoredMapping[i]) {
          const tailored = tailoredMapping[i];
          name = tailored.name || name;
          backstory = tailored.backstory || backstory;
          faction = tailored.faction || faction;
          boundNode = (graph?.nodes || []).find(n => n.id === faction || (n.label && n.label.toLowerCase() === faction.toLowerCase())) || null;
          if (!boundNode && graph?.nodes?.length > 0) {
            boundNode = (graph?.nodes || []).find(n => n.type === archetype.faction) || graph.nodes[0];
          }
          if (boundNode) {
            faction = boundNode.id;
          }
        } else {
          boundNode = (graph?.nodes || []).find(n => n.type === archetype.faction) ||
            (graph?.nodes || [])[i % (graph?.nodes?.length || 1)] || null;
          if (boundNode) {
            faction = boundNode.id;
          }
        }
 
    const allPlatforms = Object.keys(DEFAULT_CONFIG.MEMTRACE?.tokenLimits || {}).filter(k => k !== 'default');
    if (allPlatforms.length === 0) {
      allPlatforms.push('twitter', 'reddit', 'hn', 'discord', 'market', 'facebook');
    }
    const primaryPlatform = archetype.platform || 'twitter';
    const otherPlatforms = allPlatforms.filter(p => p !== primaryPlatform);
    
    // Choose number of additional platforms dynamically up to config limits
    const maxPlatforms = DEFAULT_CONFIG.MEMTRACE?.maxPlatformsPerAgent || 3;
    const numAdditional = maxPlatforms - 1;
    const shuffledOthers = [...otherPlatforms].sort(() => 0.5 - Math.random());
    const assignedPlatforms = [primaryPlatform, ...shuffledOthers.slice(0, numAdditional)];
 
    const age = tailoredMapping?.[i]?.age || archetype.age;
    const gender = tailoredMapping?.[i]?.gender || archetype.gender;
    const pseudoName = tailoredMapping?.[i]?.pseudoName || archetype.pseudoName;
    const region = tailoredMapping?.[i]?.region || archetype.region;
 
    const agent = {
      id: randomUUID(),
      simId,
      name,
      platform: primaryPlatform,
      platforms: assignedPlatforms,
      backstory,
      faction,
      boundNodeId: boundNode ? boundNode.id : null,
      riskBias: archetype.riskBias,
      evidenceDemand: archetype.evidenceDemand,
      clarityNeed: archetype.clarityNeed,
      noveltySeek: archetype.noveltySeek,
      financialStake: archetype.financialStake || 0.5,
      memoryDecay: archetype.memoryDecay || 0.15,
      cluster: null,
      
      // Demographic and memory fields
      age,
      gender,
      pseudoName,
      region,
 
      // Memory vectors
      beliefs: createBeliefState(topics),
      topics,
      recentPostIds: [],
      seenArguments: new Set(),
 
      // MemTrace specific prompt-matrix properties
      lastAction: 'Joined the simulation.',
      roundHistory: []
    };
 
    agent.cluster = clusterFromPersona(agent);
 
    agents.push(agent);
  }
 
  return agents;
}
