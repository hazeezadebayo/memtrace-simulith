import { Tool } from './Tool.js';
import { callLLM } from '../llm/ai.js';

const SYNTHESIS_PROMPT = `Given the following situation and observed events, synthesize a human-readable timeline of likely occurrences and their causal relationships.

Situation: "{situation}"

{events_section}

Think step by step about what typically happens in this kind of situation. What events follow from others? What conditions could change the outcome? Organize the timeline chronologically.

Return ONLY valid JSON in this exact format:
{{
  "milestones": [
    {{
      "event": "string - human-readable description of what happens",
      "timeframe": "string - e.g. 'Immediately', '1-2 months', '3-6 months', 'Within a year'",
      "confidence": 0.0 to 1.0,
      "depends_on": "string or null - which prior milestone this follows from, or null if it's an initial trigger"
    }}
  ],
  "narrative": "string - one paragraph telling the story of this timeline in plain language",
  "key_uncertainties": [
    "string - what could change this timeline (e.g., unexpected funding, regulatory change, personal circumstances)"
  ]
}}`;

export class TimelineProjectionTool extends Tool {
  name = 'timeline_projection';
  description = 'Given a situation and a list of observed or planned events, synthesize a human-readable timeline of likely future occurrences, their causal relationships, and key uncertainties. Useful for understanding how a decision might play out over time.';
  parameters = {
    type: 'object',
    properties: {
      situation: { type: 'string', description: 'Description of the situation or decision context' },
      events: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of observed or planned events to anchor the timeline'
      },
      context: { type: 'string', description: 'Additional context to inform the timeline (e.g., domain, constraints, preferences)' }
    },
    required: ['situation']
  };

  async execute(args) {
    const { situation, events, context } = args;
    if (!situation || !situation.trim()) {
      return { milestones: [], narrative: '', key_uncertainties: [] };
    }

    const eventsSection = Array.isArray(events) && events.length > 0
      ? `Observed events:\n${events.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
      : 'No specific events provided. Infer likely events from the situation.';

    const fullContext = context
      ? `Situation: "${situation}"\n\n${eventsSection}\n\nContext: ${context}`
      : `Situation: "${situation}"\n\n${eventsSection}`;

    const prompt = SYNTHESIS_PROMPT
      .replace('{situation}', situation)
      .replace('{events_section}', eventsSection);

    try {
      const raw = await callLLM(prompt, 0.3);
      const parsed = this._parseJson(raw);

      if (parsed && Array.isArray(parsed.milestones)) {
        return {
          milestones: parsed.milestones.map((m, i) => ({
            event: String(m.event || ''),
            timeframe: String(m.timeframe || ''),
            confidence: typeof m.confidence === 'number' ? Math.max(0, Math.min(1, m.confidence)) : 0.5,
            depends_on: m.depends_on || null
          })),
          narrative: String(parsed.narrative || ''),
          key_uncertainties: Array.isArray(parsed.key_uncertainties) ? parsed.key_uncertainties : []
        };
      }
    } catch (err) {
      console.warn('[TimelineProjectionTool] Synthesis failed:', err.message);
    }

    return { milestones: [], narrative: '', key_uncertainties: [] };
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
