import { callLLM, parseJson } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../extension/env/config.js';
import { WikipediaTool } from './WikipediaTool.js';
import { BinanceTool } from './BinanceTool.js';
import { HnTrendsTool } from './HnTrendsTool.js';

const DECIDER_PROMPT = `You are a tool selection assistant. Given a user's simulation query and facts, determine what live external data would best enrich the simulation.

User question: "{question}"
User facts: {facts}

Tools available — pick the SINGLE best fit:

1. wikipedia — Use when the query involves factual claims, historical events, scientific facts, or verifiable information that Wikipedia would cover.
2. binance — Use when the query involves prices, markets, stocks, crypto, investments, or economic indicators. Returns live price data.
3. hn_trends — Use when the query involves technology, startups, programming, science, or current trending discussions. Returns top Hacker News stories.

Priority: prefer tools that bring real external data the LLM doesn't already know.

First, synthesize a focused search query that captures the core topic.
Then, select the single most appropriate tool.

Return ONLY valid JSON:
{
  "query": "synthesized search query string",
  "tool": "wikipedia" | "binance" | "hn_trends",
  "reasoning": "one-sentence justification for why this tool fits"
}`;

export async function enrichScenarioWithTools({ question, facts }) {
  if (!question) return null;

  const factsText = (facts || []).filter(Boolean).join(' | ').slice(0, 1000);

  const prompt = DECIDER_PROMPT
    .replace('{question}', question)
    .replace('{facts}', factsText || 'None provided');

  let decision;
  try {
    const raw = await callLLM(prompt, 0.1);
    const parsed = parseJson(raw);
    if (!parsed || !parsed.tool || !parsed.query) return null;
    if (!['wikipedia', 'binance', 'hn_trends'].includes(parsed.tool)) return null;
    decision = parsed;
  } catch (err) {
    console.warn('[ToolDecider] LLM decision failed:', err.message);
    return null;
  }

  const formattedFacts = [];

  try {
    switch (decision.tool) {
      case 'wikipedia': {
        const tool = new WikipediaTool();
        const result = await tool.execute({ query: decision.query });
        if (result && result.title && !result.error) {
          formattedFacts.push(
            `[Wikipedia] ${result.title}: ${(result.excerpt || '').slice(0, 800)}`
          );
        }
        break;
      }

      case 'binance': {
        const tool = new BinanceTool();
        const result = await tool.execute({ query: decision.query });
        if (result && result.price && !result.error) {
          let fact = `[Market Data] ${result.symbol}: $${parseFloat(result.price).toFixed(2)}`;
          if (result.priceChangePercent) {
            const change = parseFloat(result.priceChangePercent).toFixed(2);
            fact += ` (24h change: ${change}%)`;
          }
          if (result.volume) {
            fact += ` | 24h volume: ${parseFloat(result.volume).toLocaleString()}`;
          }
          formattedFacts.push(fact);
        }
        break;
      }

      case 'hn_trends': {
        const tool = new HnTrendsTool();
        const result = await tool.execute({ query: decision.query });
        if (result && result.stories && result.stories.length > 0 && !result.error) {
          for (const story of result.stories) {
            formattedFacts.push(
              `[HN] "${story.title}" (${story.points} points by ${story.author}) — ${story.url}`
            );
          }
        }
        break;
      }
    }
  } catch (err) {
    console.warn(`[ToolDecider] Tool execution failed for ${decision.tool}:`, err.message);
  }

  if (formattedFacts.length === 0) return null;

  const charLimit = DEFAULT_CONFIG.promptLimits.enrichmentCharLimit || 500;
  const facts = formattedFacts.map(f =>
    f.length > charLimit ? f.slice(0, charLimit) + '...' : f
  );

  return {
    tool: decision.tool,
    query: decision.query,
    reasoning: decision.reasoning,
    facts
  };
}
