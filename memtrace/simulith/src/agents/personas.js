import { clamp01, defaultPersonasForDomain, recenterPersona } from '../utils/council_utils.js';

function personaVector(persona) {
  return [
    Number(persona.riskBias ?? 0.5),
    Number(persona.evidenceDemand ?? 0.5),
    Number(persona.clarityNeed ?? 0.5),
    Number(persona.noveltySeek ?? 0.5)
  ];
}

export function pickCluster(persona) {
  if ((persona.riskBias ?? 0.5) >= 0.75 || (persona.evidenceDemand ?? 0.5) >= 0.8) return 'skeptical';
  if ((persona.noveltySeek ?? 0.5) >= 0.7 && (persona.riskBias ?? 0.5) <= 0.45) return 'expansive';
  return 'balanced';
}

export function responseTone(persona, evidenceProfile) {
  const skeptical = persona.cluster === 'skeptical';
  const expansive = persona.cluster === 'expansive';
  if (skeptical && evidenceProfile.summary.risk >= evidenceProfile.summary.support) return 'holds back until proof is stronger';
  if (skeptical) return 'pushes for stronger evidence';
  if (expansive) return 'leans toward action and learning';
  return 'wants a balanced, staged move';
}

export function personaNote(persona, evidenceProfile) {
  const tone = responseTone(persona, evidenceProfile);
  if (tone.includes('proof')) return 'asks for proof';
  if (tone.includes('action')) return 'likes momentum';
  if (tone.includes('balanced')) return 'seeks a staged approach';
  return tone;
}

export function generatePersonas(scenario, evidenceProfile, state, count = 4) {
  const seed = defaultPersonasForDomain(scenario.domain, Math.max(3, count));
  const saved = Array.isArray(state?.personas) && state.personas.length ? state.personas : seed;
  const selected = saved.slice(0, Math.max(3, count)).map(persona => {
    const next = recenterPersona(persona, {});
    next.cluster = pickCluster(next);
    next.note = personaNote(next, evidenceProfile);
    next.responseTone = responseTone(next, evidenceProfile);
    return next;
  });

  const extra = [];
  while (selected.length + extra.length < count) {
    const base = seed[(selected.length + extra.length) % seed.length];
    const persona = recenterPersona(base, {});
    persona.id = `${scenario.domain}-${selected.length + extra.length + 1}`;
    persona.cluster = pickCluster(persona);
    persona.note = personaNote(persona, evidenceProfile);
    persona.responseTone = responseTone(persona, evidenceProfile);
    extra.push(persona);
  }

  return [...selected, ...extra].slice(0, count).map((persona, index) => ({
    ...persona,
    id: persona.id || `persona-${index + 1}`,
    cluster: persona.cluster || pickCluster(persona),
    note: persona.note || personaNote(persona, evidenceProfile),
    responseTone: persona.responseTone || responseTone(persona, evidenceProfile),
    vector: personaVector(persona),
    stanceWeight: clamp01(1 - (persona.evidenceDemand ?? 0.5) * 0.5 + (persona.noveltySeek ?? 0.5) * 0.1)
  }));
}

export function simulatePersonaReaction(persona, branch, evidenceProfile) {
  const supportScore = 0.55 * (1 - Number(persona.riskBias ?? 0.5)) + 0.25 * Number(persona.noveltySeek ?? 0.5) + 0.2 * branch.upside / 100;
  const cautionScore = 0.45 * Number(persona.riskBias ?? 0.5) + 0.35 * Number(persona.evidenceDemand ?? 0.5) + 0.2 * evidenceProfile.summary.risk / Math.max(1, evidenceProfile.summary.support + evidenceProfile.summary.risk);
  const delta = supportScore - cautionScore;

  if (delta >= 0) return { stance: 'support', text: `${persona.name} would support this move because ${branch.title.toLowerCase()} matches the upside.` };
  return { stance: 'push back', text: `${persona.name} would object because ${branch.title.toLowerCase()} still needs stronger proof.` };
}
