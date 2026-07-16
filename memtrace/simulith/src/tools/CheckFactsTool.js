import { Tool } from './Tool.js';
import { callLLM } from '../llm/ai.js';
import { WikipediaTool } from './WikipediaTool.js';

let _memory = null;
export function injectMemory(memoryModule) {
  _memory = memoryModule;
}

const ANALYSIS_PROMPT = `You are a fact-checking assistant. Evaluate the following claim against the provided evidence.

Claim: "{claim}"

Evidence from external sources:
{evidence}

Determine:
1. Does the evidence SUPPORT the claim? (true/false/null if uncertain)
2. Does the evidence CONTRADICT the claim? (true/false/null if uncertain)
3. If the evidence contradicts the claim, what is the correct version of the claim based on the evidence?
4. A brief explanation of your reasoning (1-2 sentences)

Return ONLY valid JSON in this exact format:
{{
  "supported": true | false | null,
  "contradicted": true | false | null,
  "corrected_claim": "string or null",
  "reasoning": "string"
}}`;

export class CheckFactsTool extends Tool {
  name = 'check_facts';
  description = 'Check a factual claim against external sources (Wikipedia) and stored memory. Returns whether the claim is supported, contradicted, or uncertain, along with evidence and a corrected version of the claim if the original was inaccurate.';
  parameters = {
    type: 'object',
    properties: {
      claim: { type: 'string', description: 'The factual claim to verify' },
      domain: { type: 'string', description: 'Optional domain context (e.g., finance, health, technology, career) to narrow the search' }
    },
    required: ['claim']
  };

  constructor(wikipediaTool = null) {
    super();
    this.wikipediaTool = wikipediaTool || new WikipediaTool();
  }

  async execute(args) {
    const { claim, domain } = args;
    if (!claim || !claim.trim()) {
      return { supported: null, contradicted: null, uncertain: true, evidence: [], corrected_claim: null, reasoning: 'No claim provided.' };
    }

    const evidence = [];

    // 1. Search Wikipedia
    try {
      const result = await this.wikipediaTool.execute({ query: domain ? `${claim} ${domain}` : claim });
      if (result && result.title && !result.error) {
        evidence.push({
          source: 'wikipedia',
          title: result.title,
          excerpt: (result.excerpt || '').slice(0, 500),
          url: result.url,
          relevance: 1.0
        });
      }
    } catch (err) {
      console.warn('[CheckFactsTool] Wikipedia search failed:', err.message);
    }

    // 2. Search memory substrate (best-effort)
    if (_memory && typeof _memory.searchVector === 'function') {
      try {
        const memoryResults = await _memory.searchVector(claim, 3);
        if (memoryResults && memoryResults.length > 0) {
          for (const m of memoryResults) {
            evidence.push({
              source: 'memory',
              title: m.id || 'Stored memory',
              excerpt: (m.text || '').slice(0, 500),
              url: null,
              relevance: m.score || 0.5
            });
          }
        }
      } catch (err) {
        console.warn('[CheckFactsTool] Memory search failed (non-fatal):', err.message);
      }
    }

    // 3. No evidence at all
    if (evidence.length === 0) {
      return {
        supported: null,
        contradicted: null,
        uncertain: true,
        evidence: [],
        corrected_claim: null,
        reasoning: 'No evidence found to evaluate this claim.'
      };
    }

    // 4. Analyze claim against evidence using the LLM
    const evidenceText = evidence.map(e =>
      `[${e.source}] ${e.title}: ${e.excerpt}`
    ).join('\n---\n');

    const analysisPrompt = ANALYSIS_PROMPT
      .replace('{claim}', claim)
      .replace('{evidence}', evidenceText);

    try {
      const raw = await callLLM(analysisPrompt, 0.1);
      const parsed = this._parseJson(raw);

      if (parsed && typeof parsed.supported !== 'undefined') {
        return {
          supported: parsed.supported,
          contradicted: parsed.contradicted,
          uncertain: parsed.supported === null && parsed.contradicted === null,
          evidence: evidence.slice(0, 5),
          corrected_claim: parsed.corrected_claim || null,
          reasoning: parsed.reasoning || ''
        };
      }
    } catch (err) {
      console.warn('[CheckFactsTool] LLM analysis failed:', err.message);
    }

    // Fallback: return raw evidence without analysis
    return {
      supported: null,
      contradicted: null,
      uncertain: true,
      evidence: evidence.slice(0, 5),
      corrected_claim: null,
      reasoning: 'Evidence found but could not be analyzed.'
    };
  }

  _parseJson(text) {
    if (!text) return null;
    try {
      return JSON.parse(text.trim());
    } catch {
      const match = text.trim().match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch {}
      }
    }
    return null;
  }
}
