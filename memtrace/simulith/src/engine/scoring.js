import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function branchEvidenceScore(branch, evidenceProfile, scenario) {
  const tags = branch.fitTags || [];
  const text = `${branch.title || ''} ${branch.description || ''} ${branch.action || ''} ${tags.join(' ')}`.toLowerCase();
  let score = 0;
  const hits = [];
  const tensions = (evidenceProfile && Array.isArray(evidenceProfile.tensions)) ? evidenceProfile.tensions : [];
  for (const signal of tensions) {
    if (signal && signal.label && text.includes(signal.label.toLowerCase())) {
      score += 5;
      hits.push(signal.label);
    }
  }
  const facts = (evidenceProfile && Array.isArray(evidenceProfile.facts)) ? evidenceProfile.facts : (Array.isArray(scenario?.facts) ? scenario.facts : []);
  for (const fact of facts) {
    const factText = typeof fact === 'string' ? fact : (fact ? fact.text : '');
    if (factText && typeof factText === 'string' && text.includes(factText.toLowerCase().split(' ')[0])) {
      score += 2;
      hits.push(factText);
    }
  }
  return { score, hits };
}

function personaFit(persona, branch) {
  const risky = Number(persona.riskBias ?? 0.5);
  const evidence = Number(persona.evidenceDemand ?? 0.5);
  const novelty = Number(persona.noveltySeek ?? 0.5);
  const clarity = Number(persona.clarityNeed ?? 0.5);
  const tags = branch.fitTags || [];
  const branchSignal = tags.join(' ').toLowerCase();
  let score = 0.5;
  if (branchSignal.includes('test') || branchSignal.includes('proof') || branchSignal.includes('evidence')) score += evidence * 0.25;
  if (branchSignal.includes('launch') || branchSignal.includes('commit') || branchSignal.includes('move')) score += (1 - risky) * 0.15 + novelty * 0.15;
  if (branchSignal.includes('wait') || branchSignal.includes('pause') || branchSignal.includes('safety')) score += risky * 0.2 + clarity * 0.1;
  if (branchSignal.includes('narrow') || branchSignal.includes('scope')) score += clarity * 0.1;
  return clamp(score, 0, 1);
}

function riskFromEvidence(evidenceProfile, branch) {
  const riskTerms = (evidenceProfile.score?.risk || []).length;
  const supportTerms = (evidenceProfile.score?.support || []).length;
  const contradictionTerms = (evidenceProfile.score?.contradictions || []).length;
  const base = 20 + (evidenceProfile.summary?.uncertainty || 0) * 5 + contradictionTerms * 6;
  const pressure = riskTerms * 7 - supportTerms * 2;
  const branchRiskBias = (branch.risks || []).length * 5;
  return clamp(Math.round(base + pressure + branchRiskBias), 0, 100);
}

function buildObjections(branch, evidenceProfile, personas) {
  const objections = [];
  
  // 1. Add branch-specific vulnerabilities first
  for (const item of branch.failureConditions || []) {
    objections.push(`Vulnerability: ${item}`);
  }
  for (const risk of branch.risks || []) {
    objections.push(`Tradeoff: ${risk}`);
  }

  // 2. Add actual LLM Persona Pushbacks dynamically
  const personaPushback = personas
    .filter(persona => {
       const reaction = persona.reactions?.find(r => r.branchId === branch.id);
       return reaction && (reaction.stance === 'push back' || reaction.stance === 'pushback');
    })
    .map(persona => `${persona.name} formally rejects this specific path.`);
    
  // 3. Fallback to global context if we need more volume
  for (const risk of evidenceProfile.score?.risk || []) {
    objections.push(`Context Risk: ${risk.label}`);
  }

  return [...personaPushback, ...objections].slice(0, 4);
}

function buildCounterfactuals(branch, evidenceProfile) {
  const counterfactuals = [...(branch.counterfactuals || [])];
  if ((evidenceProfile.summary?.support || 0) > (evidenceProfile.summary?.risk || 0)) {
    counterfactuals.unshift('If real-world support is stronger than the risk signals, this branch improves.');
  }
  if ((evidenceProfile.summary?.risk || 0) > (evidenceProfile.summary?.support || 0)) {
    counterfactuals.unshift('If one strong proof appears, this branch may stop being too risky.');
  }
  return [...new Set(counterfactuals)].slice(0, 4);
}

function buildDeathReason(branch, evidenceProfile, personaPushback) {
  const topRisk = evidenceProfile.score?.risk?.[0]?.label || 'risk';
  const topSupport = evidenceProfile.score?.support?.[0]?.label || 'support';
  if (branch.title.toLowerCase().includes('test') || branch.title.toLowerCase().includes('proof')) {
    return `Dies if the test stays vague, because ${topRisk} never gets resolved.`;
  }
  if (branch.title.toLowerCase().includes('commit') || branch.title.toLowerCase().includes('launch') || branch.title.toLowerCase().includes('move')) {
    return `Dies when ${topRisk} stays high and ${topSupport} stays weak.`;
  }
  if (personaPushback.length >= 2) {
    return `Dies because the skeptical personas keep asking for stronger evidence.`;
  }
  return `Dies if the branch never produces a clear signal.`;
}

export function scoreBranches(branches, scenario, evidenceProfile, contradictionGraph, personas, settings = {}) {
  const sim = DEFAULT_CONFIG.SIMULATION;
  const cfg = sim.scoring;
  const thr = sim.thresholds;
  
  // Normalize evidenceProfile to handle summary-only persisted state
  const ep = {
    summary: {
      support: Number(evidenceProfile?.summary?.support ?? evidenceProfile?.support ?? 0),
      risk: Number(evidenceProfile?.summary?.risk ?? evidenceProfile?.risk ?? 0),
      factCount: Number(evidenceProfile?.summary?.factCount ?? evidenceProfile?.factCount ?? scenario?.facts?.length ?? 0),
      sourceCount: Number(evidenceProfile?.summary?.sourceCount ?? evidenceProfile?.sourceCount ?? 0),
      uncertainty: Number(evidenceProfile?.summary?.uncertainty ?? evidenceProfile?.uncertainty ?? 0),
      pressure: Number(evidenceProfile?.summary?.pressure ?? evidenceProfile?.pressure ?? 0),
      contradictionCount: Number(evidenceProfile?.summary?.contradictionCount ?? evidenceProfile?.contradictionCount ?? 0),
      signalCount: Number(evidenceProfile?.summary?.signalCount ?? evidenceProfile?.signalCount ?? 0)
    },
    tensions: Array.isArray(evidenceProfile?.tensions) ? evidenceProfile.tensions : [],
    facts: Array.isArray(evidenceProfile?.facts) ? evidenceProfile.facts : (scenario?.facts || []),
    score: {
      support: Array.isArray(evidenceProfile?.score?.support) 
        ? evidenceProfile.score.support 
        : new Array(Number(evidenceProfile?.summary?.support ?? evidenceProfile?.support ?? 0)).fill({ label: 'Support Signal' }),
      risk: Array.isArray(evidenceProfile?.score?.risk) 
        ? evidenceProfile.score.risk 
        : new Array(Number(evidenceProfile?.summary?.risk ?? evidenceProfile?.risk ?? 0)).fill({ label: 'Risk Signal' }),
      contradictions: Array.isArray(evidenceProfile?.score?.contradictions) 
        ? evidenceProfile.score.contradictions 
        : new Array(Number(evidenceProfile?.summary?.contradictionCount ?? evidenceProfile?.contradictionCount ?? 0)).fill({ label: 'Contradiction Signal' })
    },
    grounding: Array.isArray(evidenceProfile?.grounding) ? evidenceProfile.grounding : []
  };

  // Weights (Applied to the final weighted sum)
  const weights = {
    ...sim.weights,
    ...(settings.weights || {})
  };

  const sensitivity = Number(settings.contradictionSensitivity || 1);

  const scored = branches.map(branch => {
    const evidenceScore = branchEvidenceScore(branch, ep, scenario);
    // Instead of heuristic math, read the actual LLM stances
    const llmReactions = personas.map(p => {
      const r = p.reactions?.find(react => react.branchId === branch.id) || {};
      const stance = r.stance === 'wait' ? 'push back' : (r.stance || 'push back');
      return { ...r, stance };
    });
    const supportCount = llmReactions.filter(r => r.stance === 'support').length;
    const pushbackCount = llmReactions.filter(r => r.stance === 'push back' || r.stance === 'pushback').length;
    
    const waitCount = llmReactions.filter(r => r.stance === 'wait').length;
    const isAmbiguousCollapse = personas.length > 0 && waitCount === personas.length;
    
    // Calculate an average numeric fit based on the LLM's verbal stance for backward compatibility
    const personaFits = llmReactions.map(r => r.stance === 'support' ? 0.9 : r.stance === 'wait' ? 0.5 : 0.1);
    
    const riskScore = riskFromEvidence(ep, branch);
    
    const upsideVal = Number(branch.upside) || 50;
    
    // Final Weighted Math
    const contradictionPenalty = Math.round((contradictionGraph?.items?.length || 0) * cfg.contradictionPenaltyFactor * sensitivity * (weights.contradiction || 1));
    const evidenceBonus = Math.round((evidenceScore.score * cfg.evidenceBonusWeight + ep.summary.support * 3) * (weights.evidence || 1));
    const personaBonus = Math.round((average(personaFits) * cfg.personaBonusWeight + supportCount * 3) * (weights.personaFit || 1));
    const clarityBonus = Math.round((ep.summary.factCount * 2 + ((branch.fitTags || []).includes('test') ? 6 : 0)) * (weights.clarity || 1));
    
    const penaltyLoad = Math.round((riskScore * cfg.riskPenaltyWeight + contradictionPenalty + pushbackCount * 2) * (weights.risk || 1));
    
    // Reduce the penalty scale to avoid bottoming out at 0
    const baseScore = (upsideVal * 0.55) + evidenceBonus + personaBonus + clarityBonus;
    let score = clamp(Math.round(baseScore - (penaltyLoad * 0.5)), 0, 100);

    if (isAmbiguousCollapse) {
      score = Math.floor(score * 0.5);
    }

    const objections = buildObjections(branch, ep, personas);
    const counterfactuals = buildCounterfactuals(branch, ep);
    let deathReason = buildDeathReason(branch, ep, objections.slice(0, 2));
    
    if (isAmbiguousCollapse) {
      deathReason = "AMBIGUITY COLLAPSE: 100% of the mesh rejected this path as too vague.";
    }
    
    const confidence = clamp(Math.round(cfg.confidenceBase + ep.summary.support * 4 - ep.summary.risk * 3 + supportCount * 6 - pushbackCount * 6 - contradictionGraph.items.length * 2), 5, 95);

    const why = [
      `Evidence hits: ${evidenceScore.hits.slice(0, 3).join(', ') || 'none'}.`,
      `Persona support: ${supportCount}, pushback: ${pushbackCount}.`,
      `Risk load: ${riskScore}.`,
      `Dynamic Weights: Ev:${(weights.evidence||1).toFixed(2)} Rk:${(weights.risk||1).toFixed(2)} Ct:${(weights.contradiction||1).toFixed(2)}`
    ];
    if (isAmbiguousCollapse) why.push(`AMBIGUITY COLLAPSE: Score slashed by 50% due to unanimous WAIT stance.`);

    const reaction = personas.map(persona => {
      const r = persona.reactions?.find(react => react.branchId === branch.id);
      const fit = personaFit(persona, branch);
      let finalStance = r ? r.stance : (fit >= 0.50 ? 'support' : 'push back');
      if (finalStance === 'wait') finalStance = 'push back';
      return {
        id: persona.id,
        name: persona.name,
        stance: finalStance,
        fit: Math.round(fit * 100),
        text: r ? r.text : null
      };
    });

    return {
      ...branch,
      grounding: ep.grounding.filter(g => 
        (branch.fitTags || []).some(tag => g.label.toLowerCase().includes(tag.toLowerCase()))
      ),
      objections,
      counterfactuals,
      deathReason,
      confidence,
      score,
      why,
      reaction,
      riskScore,
      personaSupport: supportCount,
      personaPushback: pushbackCount
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((branch, index) => ({
    ...branch,
    rank: index === 0 ? 'best' : index === 1 ? 'runner-up' : index === scored.length - 1 ? 'weakest' : 'alternate'
  }));
}
