/* ==================================================================
   simulith/src/graph_ontology.js
   Deterministic scenario graph builder.

   Responsibilities:
     - Normalize scenario nouns into typed nodes
     - Infer node type from label + optional explicit type
     - Build genuine directed edges from ontology rules
     - Avoid using an LLM for graph structure
   ================================================================== */

import { randomUUID } from 'node:crypto';
import { slugify } from '../agents/belief_state.js';
import { MEMTRACE_DOMAINS } from '../data/manifest.js';
import { getEmbedding, cosineSimilarity } from '../../../extension/llm/embedding.js';
import { callLLM } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

let RELATION_EMBEDDINGS = null;

const NODE_TYPES = [
  'person',
  'organization',
  'location',
  'metric',
  'resource',
  'event',
  'regulation',
  'concept',
  'infrastructure',
  'product',
  'brand',
  'asset_class',
  'market_segment',
  'unknown',
];

const TYPE_PRIORITY = {
  person: 9,
  organization: 8,
  event: 7,
  regulation: 7,
  infrastructure: 6,
  metric: 5,
  resource: 5,
  product: 5,
  brand: 5,
  asset_class: 5,
  market_segment: 4,
  location: 4,
  concept: 3,
  unknown: 1,
};

// Canonical relation templates by source/target type.
// These are intentionally reusable across all scenarios.
const RELATION_RULES = {
  person: {
    person: ['advises', 'opposes', 'aligns_with', 'criticizes'],
    organization: ['founded', 'manages', 'works_at', 'influences', 'invests_in', 'criticizes'],
    location: ['visits', 'relocates_to', 'represents'],
    metric: ['affects', 'tracks', 'reacts_to', 'depends_on'],
    resource: ['consumes', 'uses', 'depends_on', 'influences'],
    event: ['causes', 'attends', 'responds_to', 'covers'],
    regulation: ['lobbies_for', 'lobbies_against', 'is_constrained_by'],
    concept: ['promotes', 'questions', 'believes_in', 'rejects'],
    infrastructure: ['uses', 'depends_on', 'manages'],
  },

  organization: {
    person: ['employs', 'appoints', 'funds', 'fires', 'lobbies'],
    organization: ['partners_with', 'competes_with', 'acquires', 'supplies', 'depends_on'],
    location: ['operates_in', 'hosts', 'expands_to', 'shuts_down_in'],
    metric: ['drives', 'reports_on', 'improves', 'worsens', 'depends_on'],
    resource: ['consumes', 'produces', 'buys', 'sells', 'stores'],
    event: ['triggers', 'responds_to', 'sponsors', 'is_hit_by'],
    regulation: ['complies_with', 'lobbies_against', 'violates', 'is_bound_by'],
    concept: ['shapes', 'signals', 'reframes', 'amplifies'],
    infrastructure: ['uses', 'depends_on', 'maintains'],
  },

  location: {
    person: ['attracts', 'displaces', 'hosts', 'originates_from'],
    organization: ['hosts', 'contains', 'constrains', 'enables'],
    location: ['contains', 'borders', 'competes_with'],
    metric: ['affects', 'correlates_with'],
    resource: ['contains', 'exports', 'imports', 'depends_on'],
    event: ['hosts', 'experiences', 'is_affected_by'],
    regulation: ['is_governed_by'],
    concept: ['symbolizes', 'represents'],
    infrastructure: ['contains', 'depends_on'],
  },

  metric: {
    person: ['affects', 'signals_to', 'is_watched_by'],
    organization: ['measures', 'shapes', 'tracks', 'is_reported_by'],
    location: ['varies_by'],
    metric: ['correlates_with', 'moves_with', 'offsets'],
    resource: ['reflects', 'tracks', 'is_driven_by'],
    event: ['jumps_on', 'drops_on', 'reacts_to'],
    regulation: ['responds_to', 'is_constrained_by'],
    concept: ['signals', 'captures'],
    infrastructure: ['depends_on', 'is_constrained_by'],
  },

  resource: {
    person: ['needs', 'consumes', 'prices'],
    organization: ['supplies', 'buys', 'sells', 'depends_on'],
    location: ['flows_through', 'is_extracted_in', 'is_shipped_through'],
    metric: ['drives', 'moves', 'impacts'],
    resource: ['substitutes_for', 'depends_on', 'competes_with'],
    event: ['disrupted_by', 'shipped_after', 'used_in'],
    regulation: ['is_taxed_by', 'is_restricted_by'],
    concept: ['symbolizes', 'represents'],
    infrastructure: ['flows_through', 'uses', 'depends_on'],
  },

  event: {
    person: ['involves', 'affects', 'is_responded_to_by'],
    organization: ['triggers', 'disrupts', 'benefits', 'hurts'],
    location: ['occurs_in', 'spreads_to'],
    metric: ['moves', 'signals', 'changes'],
    resource: ['consumes', 'blocks', 'disrupts'],
    event: ['follows', 'escalates_from'],
    regulation: ['provokes', 'is_shaped_by'],
    concept: ['induces', 'reinforces', 'weakens'],
    infrastructure: ['disrupts', 'tests', 'reveals_failure_in'],
  },

  regulation: {
    person: ['constrains', 'protects', 'penalizes'],
    organization: ['mandates', 'restricts', 'taxes', 'fines', 'guides'],
    location: ['applies_to'],
    metric: ['influences', 'reframes'],
    resource: ['taxes', 'bans', 'requires'],
    event: ['causes', 'prevents', 'delays'],
    regulation: ['overlaps_with', 'conflicts_with'],
    concept: ['formalizes', 'codifies'],
    infrastructure: ['requires', 'constrains'],
  },

  concept: {
    person: ['shapes', 'influences', 'motivates', 'frustrates'],
    organization: ['guides', 'frames', 'signals', 'undermines'],
    location: ['associated_with'],
    metric: ['correlates_with', 'signals'],
    resource: ['represents', 'drives'],
    event: ['explains', 'predicts', 'amplifies'],
    regulation: ['motivates', 'justifies'],
    concept: ['reinforces', 'contradicts', 'competes_with', 'bundles_with'],
    infrastructure: ['depends_on'],
  },

  infrastructure: {
    person: ['uses', 'depends_on', 'maintains'],
    organization: ['operates', 'depends_on', 'invests_in', 'breaks'],
    location: ['is_sited_in', 'connects_to'],
    metric: ['affects', 'depends_on'],
    resource: ['transports', 'stores', 'delivers'],
    event: ['fails_during', 'enables', 'disrupts'],
    regulation: ['is_regulated_by'],
    concept: ['embodies'],
    infrastructure: ['connects_to', 'depends_on', 'competes_with'],
  },

  product: {
    person: ['appeals_to', 'solves_for', 'disappoints'],
    organization: ['built_by', 'sold_by', 'acquired_by'],
    market_segment: ['targets', 'dominates', 'fails_in'],
    brand: ['enhances', 'dilutes'],
    concept: ['represents']
  },

  brand: {
    person: ['attracts', 'alienates', 'influences'],
    organization: ['owned_by', 'represents'],
    product: ['endorses', 'covers']
  },

  asset_class: {
    person: ['held_by', 'traded_by'],
    organization: ['issued_by', 'managed_by'],
    metric: ['correlates_with', 'driven_by'],
    market_segment: ['appeals_to']
  },

  market_segment: {
    person: ['comprises'],
    product: ['demands', 'rejects'],
    brand: ['prefers', 'ignores']
  },

  unknown: {
    unknown: ['related_to'],
  },
};

const RELATION_KEYWORDS = {
  founded: ['found', 'founded', 'cofound', 'co-founded', 'startup', 'created'],
  manages: ['manage', 'manages', 'runs', 'ceo', 'lead', 'oversee', 'directs'],
  works_at: ['works at', 'employee', 'employed by', 'staff'],
  influences: ['influence', 'influences', 'tweet', 'signal', 'sentiment', 'brand'],
  invests_in: ['invest', 'invests', 'back', 'fund', 'funds', 'capital'],
  criticizes: ['criticize', 'criticizes', 'attack', 'attacks', 'against'],
  employs: ['hire', 'employ', 'employs', 'staff'],
  appoints: ['appoint', 'appoints'],
  partners_with: ['partner', 'partners', 'alliance', 'collaborate'],
  competes_with: ['compete', 'competes', 'rival', 'rivals'],
  acquires: ['acquire', 'acquires', 'buy', 'bought', 'purchase'],
  operates_in: ['operate in', 'operates in', 'presence in', 'based in'],
  reports_on: ['report', 'reports', 'reporting'],
  measures: ['measure', 'measures', 'metric', 'index'],
  drives: ['drive', 'drives', 'boost', 'boosts', 'push', 'pushes'],
  affects: ['affect', 'affects', 'impact', 'impacts', 'moves'],
  consumes: ['consume', 'consumes', 'burn', 'uses up'],
  produces: ['produce', 'produces', 'make', 'makes', 'supply'],
  hosts: ['host', 'hosts'],
  complies_with: ['comply', 'complies', 'compliance'],
  lobbies_for: ['lobby for', 'lobbies for', 'advocate', 'supports'],
  lobbies_against: ['lobby against', 'lobbies against', 'oppose', 'opposes'],
  mandates: ['mandate', 'mandates', 'require', 'requires'],
  restricts: ['restrict', 'restricts', 'ban', 'bans', 'limit', 'limits'],
  grows_with: ['grow', 'grows', 'expands'],
  correlates_with: ['correlate', 'correlates'],
  depends_on: ['depend', 'depends', 'dependent', 'requires'],
  causes: ['cause', 'causes', 'trigger', 'triggers', 'lead to'],
  disrupts: ['disrupt', 'disrupts', 'breaks', 'shock'],
  symbolizes: ['symbolize', 'symbolizes', 'represents'],
};

function normalizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function inferNodeType(label, explicitType = null) {
  if (explicitType && NODE_TYPES.includes(explicitType)) return explicitType;

  const v = normalizeLabel(label);
  const l = v.toLowerCase();

  const orgHints = [
    'inc', 'corp', 'corporation', 'company', 'bank', 'foundation', 'agency', 'ministry',
    'committee', 'authority', 'commission', 'university', 'school', 'greenpeace',
    'tesla', 'openai', 'microsoft', 'google', 'amazon', 'apple', 'meta', 'nvidia',
    'llc', 'ltd', 'group', 'holdings', 'partners', 'labs', 'studio',
  ];
  if (orgHints.some((x) => l === x || l.includes(` ${x}`) || l.endsWith(` ${x}`) || l.includes(`${x} `))) {
    return 'organization';
  }

  const regulationHints = ['law', 'tariff', 'tax', 'ban', 'regulation', 'rule', 'mandate', 'policy', 'bill', 'sanction'];
  if (regulationHints.some((x) => l.includes(x))) return 'regulation';

  const metricHints = ['rate', 'price', 'index', 'sentiment', 'inflation', 'interest', 'yield', 'gdp', 'cpi', 'pmi', 'unemployment', 'volatility'];
  if (metricHints.some((x) => l.includes(x))) return 'metric';

  const resourceHints = ['oil', 'gas', 'electricity', 'power', 'microchips', 'chips', 'water', 'steel', 'food', 'labor', 'capital'];
  if (resourceHints.some((x) => l.includes(x))) return 'resource';

  const eventHints = ['rally', 'vote', 'explosion', 'strike', 'election', 'launch', 'hearing', 'meeting', 'conference', 'panic', 'crash'];
  if (eventHints.some((x) => l.includes(x))) return 'event';

  const infraHints = ['grid', 'lane', 'pipeline', 'port', 'rail', 'network', 'server', 'datacenter', 'factory', 'road', 'bridge', 'system'];
  if (infraHints.some((x) => l.includes(x))) return 'infrastructure';

  const locationHints = ['city', 'country', 'state', 'region', 'middle east', 'europe', 'asia', 'africa', 'america', 'offshore'];
  if (locationHints.some((x) => l.includes(x))) return 'location';

  const conceptHints = ['sentiment', 'panic', 'trust', 'fear', 'momentum', 'risk', 'confidence', 'reputation', 'narrative'];
  if (conceptHints.some((x) => l.includes(x))) return 'concept';

  // Capitalized human-like names are treated as person unless they hit org/location rules.
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(v)) return 'person';

  return 'concept';
}

function nodeIdFromLabel(label) {
  return slugify(label).replace(/[^a-z0-9_]/g, '_');
}

function toNode(input) {
  if (typeof input === 'string') {
    const label = normalizeLabel(input);
    return {
      id: nodeIdFromLabel(label),
      label,
      type: inferNodeType(label),
      source: 'input',
    };
  }

  const label = normalizeLabel(input?.label || input?.name || input?.text || '');
  return {
    id: nodeIdFromLabel(label),
    label,
    type: inferNodeType(label, input?.type),
    source: input?.source || 'input',
    meta: input?.meta || {},
  };
}

async function uniqueNodes(nodes) {
  const validNodes = nodes.map(toNode).filter(n => n.label);
  const seen = [];

  try {
    // Generate embeddings concurrently for all valid candidate nodes
    const nodeEmbs = await Promise.all(
      validNodes.map(async (n) => {
        const emb = await getEmbedding(n.label, "xenova");
        return { ...n, emb };
      })
    );

    for (const node of nodeEmbs) {
      if (!node.emb) {
        // Fallback to exact match if embedding fails
        const existing = seen.find(s => s.id === node.id);
        if (!existing) seen.push(node);
        else if (TYPE_PRIORITY[node.type] > TYPE_PRIORITY[existing.type]) {
          existing.type = node.type;
        }
        continue;
      }

      let isDuplicate = false;
      for (const existing of seen) {
        if (!existing.emb) continue;
        
        // Check structural/exact match first
        if (existing.id === node.id) {
          isDuplicate = true;
          if (TYPE_PRIORITY[node.type] > TYPE_PRIORITY[existing.type]) existing.type = node.type;
          break;
        }
        
        // Deep semantic match
        const score = cosineSimilarity(node.emb, existing.emb);
        if (score > 0.58) {
          isDuplicate = true;
          // Upgrade type if the duplicate has a higher priority type
          if (TYPE_PRIORITY[node.type] > TYPE_PRIORITY[existing.type]) existing.type = node.type;
          // We keep the shorter/simpler label if it's a semantic duplicate
          if (node.label.length < existing.label.length) {
            existing.label = node.label;
            existing.id = node.id;
          }
          break;
        }
      }

      if (!isDuplicate) {
        seen.push(node);
      }
    }
  } catch (err) {
    console.warn("[Node Deduplication] Semantic matching failed, falling back to lexical:", err.message);
    // Fallback: standard lexical deduplication
    const seenMap = new Map();
    for (const node of validNodes) {
      if (!seenMap.has(node.id)) seenMap.set(node.id, node);
      else {
        const existing = seenMap.get(node.id);
        if (TYPE_PRIORITY[node.type] > TYPE_PRIORITY[existing.type]) {
          seenMap.set(node.id, { ...existing, type: node.type });
        }
      }
    }
    return [...seenMap.values()];
  }

  // Strip out embeddings before returning
  return seen.map(({ emb, ...rest }) => rest);
}

const STOPWORDS = new Set([
  'should', 'would', 'could', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'more', 'most', 'my', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'out', 'over', 'own', 'same', 'she', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'you', 'your', 'yours', 'yourself', 'yourselves', 'i', 'a', 'an', 'the', 'now', 'will', 'can', 'them', 'our', 'out', 'us', 'we', 'they', 'our', 'what'
]);

const DOMAIN_KEYWORDS = [
  'crowdfunding campaign', 'crowdfunding', 'early bird', 'bird offers', 'strategy schemas',
  'runway', 'cash flow', 'interest rates', 'inflation rate', 'unemployment rate',
  'consumer sentiment', 'recession', 'recession fear', 'recession fears', 'marketing campaign',
  'outsourcing', 'hiring', 'talent acquisition', 'venture capital', 'equity', 'shares',
  'stock price', 'market sentiment', 'public panic', 'shipping lane', 'power grid',
  'carbon tax law', 'import tariff', 'microchips', 'crude oil', 'electricity', 'longevity',
  'time management', 'personal finance', 'budgeting', 'dating', 'marriage', 'parenting',
  'habit building', 'promotion', 'layoff', 'job change', 'branding', 'art direction'
];

const FACTION_TO_TYPE_MAP = {
  Regulators: 'regulation',
  Corporates: 'organization',
  Activists: 'organization',
  Consumers: 'person',
  Financials: 'organization',
  Techies: 'person',
  Media: 'organization',
  Citizens: 'person',
  Labor: 'organization',
  Geopolitics: 'concept',
  Academics: 'person',
  Planners: 'person',
  Politicians: 'person',
  NGOs: 'organization',
  Public: 'person',
  Speculators: 'person',
  Investors: 'organization',
  Founders: 'person',
  Marketing: 'organization',
  Operations: 'organization',
  Product: 'person',
  Legal: 'organization',
  Sales: 'organization',
  Support: 'person',
  Property: 'organization',
  Analysts: 'person',
  Advisors: 'person',
  Optimists: 'person',
  Skeptics: 'person',
  Strategists: 'person',
  Guardians: 'person',
  Doctors: 'person',
  Biohackers: 'person',
  Nutrition: 'concept',
  Fitness: 'concept',
  Alternative: 'concept',
  Patients: 'person',
  Architects: 'person',
  Innovators: 'person',
  Ops: 'person',
  UX: 'person',
  Writers: 'person',
  Artists: 'person',
  Influencers: 'person',
  Recruiters: 'person',
  Workers: 'person',
  Institutions: 'organization',
  Shoppers: 'person',
  Enthusiasts: 'person',
  Optimizers: 'person',
  Defense: 'organization'
};

function resolveNodeTypeFromFaction(faction) {
  return FACTION_TO_TYPE_MAP[faction] || 'concept';
}

function extractSequences(text) {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const results = [];
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (w1.length >= 3 && w2.length >= 3 && !STOPWORDS.has(w1) && !STOPWORDS.has(w2)) {
      results.push(`${w1} ${w2}`);
      if (i < words.length - 2) {
        const w3 = words[i + 2];
        if (w3.length >= 3 && !STOPWORDS.has(w3)) {
          results.push(`${w1} ${w2} ${w3}`);
        }
      }
    }
  }
  return results;
}

function extractCandidateNodesFromText(scenario) {
  const text = [
    scenario?.question || '',
    ...(scenario?.facts || []),
    ...(scenario?.context || []),
  ].join(' ');

  const nodes = [];

  // 1. Capitalized multi-word phrases.
  const capPhrases = text.match(/\b(?:[A-Z][a-z0-9&.-]+(?:\s+[A-Z][a-z0-9&.-]+){0,4})\b/g) || [];
  for (const phrase of capPhrases) {
    if (phrase.toLowerCase() !== 'should' && phrase.toLowerCase() !== 'should i') {
      nodes.push(phrase);
    }
  }

  // 2. Keyword-based matching.
  const lower = text.toLowerCase();
  for (const phrase of DOMAIN_KEYWORDS) {
    if (lower.includes(phrase)) nodes.push(phrase);
  }

  // 3. Dynamic sequence extraction.
  const seqs = extractSequences(text);
  nodes.push(...seqs);

  return nodes;
}

async function extractScenarioNodes(scenario) {
  const explicit = [
    ...(Array.isArray(scenario?.nodes) ? scenario.nodes : []),
    ...(Array.isArray(scenario?.entities) ? scenario.entities : []),
    ...(Array.isArray(scenario?.topics) ? scenario.topics : []),
  ];

  // 1. LLM World Builder (Explicit + Implicit entities)
  const prompt = `
You are an expert ontology architect building a simulation world.
Scenario: "${scenario.question}"
Facts: ${(scenario.facts || []).join('; ')}

Identify the explicitly mentioned actors/concepts in the scenario. Then, extrapolate and generate the IMPLICIT actors required to simulate this world accurately (e.g. competitors, regulatory bodies, market forces, demographics, infrastructure).

Return ONLY a strictly formatted JSON object with arrays of entity strings, categorized by these exact keys:
"person", "organization", "location", "metric", "resource", "event", "regulation", "concept", "infrastructure", "product", "brand", "asset_class", "market_segment".

Example:
<json>
{
  "organization": ["OpenAI", "SEC"],
  "concept": ["AGI Timeline", "Inflation"]
}
</json>
`;

  let llmNodes = [];
  try {
    const response = await callLLM(prompt);
    const jsonMatch = response.match(/<json>([\s\S]*?)<\/json>/i) || response.match(/```json\n([\s\S]*?)\n```/i);
    const jsonText = jsonMatch ? jsonMatch[1] : response;
    
    // Attempt parsing
    let parsed;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch(e) {
      // Very crude fallback if markdown formatting is weird
      const justBraces = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf('}') + 1);
      parsed = JSON.parse(justBraces);
    }

    for (const [type, entities] of Object.entries(parsed)) {
      if (Array.isArray(entities) && NODE_TYPES.includes(type)) {
        llmNodes.push(...entities.map(e => ({ id: slugify(String(e)), label: String(e), type })));
      }
    }
  } catch (err) {
    console.warn('[Graph Ontology] LLM node extraction failed or returned invalid JSON. Relying purely on Regex.', err.message);
  }

  // 2. Fast Regex Extraction (Fallback + Coverage)
  const extracted = extractCandidateNodesFromText(scenario);
  
  // 3. Merge and deduplicate
  const allNodes = [...explicit, ...llmNodes, ...extracted];
  return await uniqueNodes(allNodes);
}

function relationKeywordsHit(text, relation) {
  const hay = text.toLowerCase();
  const keys = RELATION_KEYWORDS[relation] || [];
  let score = 0;

  for (const key of keys) {
    if (hay.includes(key)) score += key.includes(' ') ? 0.25 : 0.12;
  }

  return Math.min(score, 0.4);
}

function candidateRelations(srcType, dstType) {
  const srcRules = RELATION_RULES[srcType] || RELATION_RULES.unknown;
  return srcRules[dstType] || [];
}

function scoreEdge({ src, dst, relation, scenarioText }) {
  let score = 0.2;

  // Base relation quality by type pair.
  score += relation.length <= 8 ? 0.06 : 0.03;

  // Stronger relations should win when text supports them.
  score += relationKeywordsHit(scenarioText, relation);

  // Type-specific boosts.
  if (src.type === 'person' && dst.type === 'organization' && ['founded', 'manages', 'works_at'].includes(relation)) score += 0.15;
  if (src.type === 'organization' && dst.type === 'metric' && ['drives', 'reports_on', 'affects'].includes(relation)) score += 0.14;
  if (src.type === 'regulation' && ['organization', 'resource', 'event'].includes(dst.type) && ['mandates', 'restricts', 'taxes'].includes(relation)) score += 0.16;
  if (src.type === 'event' && ['organization', 'metric', 'resource'].includes(dst.type) && ['disrupts', 'causes', 'changes'].includes(relation)) score += 0.14;
  if (src.type === 'location' && dst.type === 'organization' && ['hosts', 'constrains', 'enables'].includes(relation)) score += 0.10;
  if (src.type === 'concept' && dst.type === 'concept' && ['reinforces', 'contradicts', 'competes_with'].includes(relation)) score += 0.10;

  // Names help when the text literally mentions both endpoints.
  const lower = scenarioText.toLowerCase();
  if (lower.includes(src.label.toLowerCase())) score += 0.03;
  if (lower.includes(dst.label.toLowerCase())) score += 0.03;

  // Xenova Semantic Edge Alignment
  if (typeof RELATION_EMBEDDINGS !== 'undefined' && RELATION_EMBEDDINGS && RELATION_EMBEDDINGS[relation]) {
    if (src.emb) {
      const srcSim = cosineSimilarity(src.emb, RELATION_EMBEDDINGS[relation]);
      if (srcSim > 0.80) score += 0.15; // Semantic alignment bonus
    }
    if (dst.emb) {
      const dstSim = cosineSimilarity(dst.emb, RELATION_EMBEDDINGS[relation]);
      if (dstSim > 0.80) score += 0.15; // Semantic alignment bonus
    }
  }

  return Math.max(0.01, Math.min(1, score));
}

function edgeId(srcId, relation, dstId) {
  return `${srcId}__${relation}__${dstId}`;
}

/**
 * Build a deterministic scenario graph.
 *
 * @param {object} scenario - { question, facts, nodes, entities, topics, context }
 * @param {Array<string|object>} [fallbackNodes=[]]
 * @param {object} [options]
 * @param {number} [options.maxEdges=222]
 * @returns {{ id: string, nodes: Array, edges: Array, adjacency: Map, nodeById: Map }}
 */
export async function buildScenarioGraph(scenario, fallbackNodes = [], options = {}) {
  const maxEdges = options.maxEdges ?? 222;
  const graphId = randomUUID();

  const nodeInputs = [
    ...fallbackNodes,
    ...(await extractScenarioNodes(scenario)),
  ];

  let nodes = (await uniqueNodes(nodeInputs)).map((n, index) => ({
    ...n,
    order: index,
  }));

  // Domain Seeding Engine: Inject domain-specific archetypes (actors/schemas)
  const domainKey = (scenario.domain || 'BUSINESS').toUpperCase();
  const domainArchetypes = MEMTRACE_DOMAINS[domainKey] || MEMTRACE_DOMAINS['BUSINESS'];
  
  if (domainArchetypes) {
    for (const arch of domainArchetypes) {
      const id = slugify(arch.name);
      if (!nodes.some(n => n.id === id)) {
        nodes.push({ 
          id, 
          label: arch.name, 
          type: resolveNodeTypeFromFaction(arch.faction), 
          stability: 'stable',
          order: nodes.length 
        });
      }
    }
  }

  // Fallback Minimum Enforcement (if domain archetypes were somehow missing)
  if (nodes.length < 6) {
    const generic = ['Market', 'Regulator', 'Consumer', 'Media', 'Competitor', 'Resource'];
    for (const g of generic) {
      const id = slugify(g);
      if (!nodes.some(n => n.id === id)) {
        nodes.push({ id, label: g, type: 'concept', order: nodes.length });
        if (nodes.length >= 6) break;
      }
    }
  }

  // Enforce Max 30 nodes limit
  if (nodes.length > 30) {
    nodes = nodes.slice(0, 30);
  }

  const scenarioText = [
    scenario?.question || '',
    ...(scenario?.facts || []),
    ...(scenario?.context || []),
    ...nodes.map((n) => n.label),
  ].join(' ');

  // Initialize relation embeddings once per engine lifecycle
  if (!RELATION_EMBEDDINGS) {
    RELATION_EMBEDDINGS = {};
    for (const [rel, keywords] of Object.entries(RELATION_KEYWORDS)) {
      try {
        RELATION_EMBEDDINGS[rel] = await getEmbedding(keywords.join(' '), 'xenova');
      } catch (e) {
        RELATION_EMBEDDINGS[rel] = null;
      }
    }
  }

  // Pre-compute node embeddings for Xenova edge scoring
  for (const n of nodes) {
    if (n.emb === undefined) {
      try {
        n.emb = await getEmbedding(n.label, 'xenova');
      } catch (e) {
        n.emb = null;
      }
    }
  }

  const edges = [];
  const edgeSeen = new Set();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;

      const src = nodes[i];
      const dst = nodes[j];
      const relations = candidateRelations(src.type, dst.type);

      for (const relation of relations) {
        const score = scoreEdge({ src, dst, relation, scenarioText });

        // Keep only meaningful edges.
        if (score < 0.28) continue;

        const id = edgeId(src.id, relation, dst.id);
        if (edgeSeen.has(id)) continue;

        edgeSeen.add(id);
        edges.push({
          id,
          src: src.id,
          dst: dst.id,
          rel: relation,
          weight: Number(score.toFixed(3)),
          srcType: src.type,
          dstType: dst.type,
          rationale: `${src.label} ${relation} ${dst.label}`,
        });
      }
    }
  }

  // Sort by strongest and keep graph compact.
  edges.sort((a, b) => b.weight - a.weight);

  const targetEdgeCount = Math.min(
    maxEdges,
    Math.max(nodes.length, Math.round(nodes.length * 1.7))
  );

  const trimmedEdges = edges.slice(0, targetEdgeCount);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map();

  for (const node of nodes) adjacency.set(node.id, { out: [], in: [], all: [] });

  for (const edge of trimmedEdges) {
    const srcBucket = adjacency.get(edge.src);
    const dstBucket = adjacency.get(edge.dst);
    if (srcBucket) {
      srcBucket.out.push(edge);
      srcBucket.all.push(edge);
    }
    if (dstBucket) {
      dstBucket.in.push(edge);
      dstBucket.all.push(edge);
    }
  }

  return {
    id: graphId,
    nodes,
    edges: trimmedEdges,
    adjacency,
    nodeById,
  };
}

export function buildCommunicationMap(graph) {
  const map = new Map();

  for (const node of graph.nodes) {
    map.set(node.id, new Set());
  }

  for (const edge of graph.edges) {
    if (!map.has(edge.src)) map.set(edge.src, new Set());
    if (!map.has(edge.dst)) map.set(edge.dst, new Set());

    map.get(edge.src).add(edge.dst);
    map.get(edge.dst).add(edge.src);
  }

  return map;
}
