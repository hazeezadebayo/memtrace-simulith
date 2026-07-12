function clean(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}


function unique(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import { callLLM, parseJson } from '../llm/ai.js';

async function scoreTextLLM(text) {
  const prompt = `Analyze the following scenario text and categorize specific signals, risks, pressures, or conflicts.
Text to analyze: "${text}"

Respond ONLY with valid JSON in the following format:
{
  "support": [{"label": "specific numbers", "why": "Contains concrete numeric evidence"}, ...],
  "risk": [{"label": "adoption risk", "why": "Depends on another person choosing to engage"}, {"label": "cost pressure", "why": "Mentions budget, runway or money"}, {"label": "time pressure", "why": "Has a deadline or short window"}, {"label": "evidence gap", "why": "Evidence is still thin"}, {"label": "downside risk", "why": "Could fail even if idea is good"}],
  "signals": ["cost pressure", "adoption risk"],
  "contradictions": [{"label": "negation conflict", "why": "Negative statement fighting the action"}, {"label": "conflicting signal", "why": "Unresolved tension"}]
}
Only output the JSON object, nothing else. Make sure to accurately categorize based on the semantic meaning of the text, not just keyword matching.`;

  const responseText = await callLLM(prompt, 0.1);
  const parsed = parseJson(responseText);

  if (parsed && parsed.support && parsed.risk && parsed.signals && parsed.contradictions) {
    return {
      support: unique(parsed.support),
      risk: unique(parsed.risk),
      signals: unique(parsed.signals),
      contradictions: unique(parsed.contradictions)
    };
  }

  // Fallback if LLM fails
  return { support: [], risk: [], signals: [], contradictions: [] };
}

export async function buildEvidenceProfile(scenario) {
  const facts = scenario.facts.map((text, index) => ({
    id: `fact-${index + 1}`,
    text: clean(text),
    type: 'fact'
  })).filter(f => f.text);

  const merged = clean([scenario.question, ...facts.map(f => f.text)].join(' '));
  const score = await scoreTextLLM(merged);

  // GROUNDING: Map scores back to specific evidence items
  const grounding = [];
  const allEvidence = [...facts];
  
  for (const item of score.support) {
    const matched = allEvidence.find(e => e.text.toLowerCase().includes(item.label.split(' ')[0]));
    grounding.push({ ...item, type: 'support', evidenceId: matched?.id || 'general' });
  }
  for (const item of score.risk) {
    const matched = allEvidence.find(e => e.text.toLowerCase().includes(item.label.split(' ')[0]));
    grounding.push({ ...item, type: 'risk', evidenceId: matched?.id || 'general' });
  }

  const claims = unique([...facts.map(f => f.text), ...merged.split(/(?<=[.!?])\s+/).map(clean).filter(Boolean).slice(0, 12)]);
  const evidenceLinks = facts.map(f => ({
    id: f.id,
    title: f.text.slice(0, 40),
    snippet: f.text.slice(0, 180),
    type: f.text.startsWith('http') ? 'url' : 'fact',
    url: f.text.startsWith('http') ? f.text : null
  }));

  return {
    text: merged,
    facts,
    claims,
    score,
    grounding,
    summary: {
      factCount: facts.length,
      support: score.support.length,
      risk: score.risk.length,
      signalCount: score.signals.length,
      contradictionCount: score.contradictions.length,
      uncertainty: score.risk.length + Math.max(0, 2 - facts.length),
      pressure: score.signals.includes('cost pressure') ? 2 : 0
    },
    evidenceLinks,
    tensions: unique([...score.support, ...score.risk, ...score.contradictions]).map(item => ({ id: item.label, ...item }))
  };
}
