import { buildExecutiveBriefPrompt } from '../llm/prompts.js';
import { callLLM, callLLMWithSystem, parseJson, REPORT_SYSTEM_PROMPT } from '../llm/ai.js';
import { getEmbedding, cosineSimilarity } from '../../../extension/llm/embedding.js';

export async function determineDomainAndAudience(question, facts) {
  const prompt = `
    Analyze the following question and facts to determine the specific domain and target audience.
    Question: ${question}
    Facts: ${facts.join(', ')}
    
    Return JSON format exactly like this:
    {
      "domain": "e.g., Software Engineering, Real Estate, Health Tech",
      "audience": "e.g., Senior Developers, First-time Homebuyers"
    }
  `;
  const result = await callLLM(prompt, 0.5);
  if (!result) return { domain: 'general', audience: 'general' };
  const parsed = parseJson(result);
  return {
    domain: parsed?.domain || 'general',
    audience: parsed?.audience || 'general'
  };
}

function ensureArrayOfStrings(val) {
  if (Array.isArray(val)) {
    return val.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof val === 'string' && val.trim() !== '') {
    return [val.trim()];
  }
  return [];
}

export async function proposeGenerativeBranches(scenario, evidence, emit = () => { }) {
  const count = scenario.branchCount || 3;
  const branches = [];
  const generatedEmbeddings = [];

  // 10 distinct, highly opinionated fallback themes
  const ALL_FALLBACK_THEMES = [
    'Rapid Action & Expansion',        // push forward aggressively in any domain
    'Risk Containment & Safeguards',   // defensive posture, minimize exposure
    'Paradigm Shift & Redirection',    // council or reframe the entire approach
    'Incremental Improvement & Tuning',// optimize existing setup step by step
    'Collaboration & Alliances',       // partner with others, share burden
    'Resource Conservation & Efficiency', // cut waste, preserve runway
    'Focused Specialization',          // double down on a niche strength
    'Rules & External Alignment',      // adapt to laws, norms, authority
    'Identity & Reputation Building',  // strengthen brand, trust, social capital
    'Exit & Reallocation'              // cash out, withdraw, or redeploy assets
  ];

  // Decompose the query space into its primary strategic directions or alternatives
  let options = [];
  try {
    const decompPrompt = `
      <instructions>
        Analyze this strategic decision query:
        Q: ${scenario.question}

        Extract the primary choices or strategic directions implied and explore the query space.
        - For comparative queries (e.g., "Do A or B?"), list the alternatives.
        - For open-ended queries (e.g., "How to achieve X?"), list the primary pathways or dimensions to solve it.

        Output EXACTLY ONE JSON array of strings. Keep each string under 5 words. Min: 1, Max: 3.
      </instructions>
      ["Strategic Direction A", "Strategic Direction B"]
    `;
    const decompResult = await callLLM(decompPrompt, 0.2);
    if (decompResult) {
      const parsed = parseJson(decompResult);
      if (Array.isArray(parsed) && parsed.length > 0) {
        options = parsed.map(o => o.trim());
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') throw err;
    emit('parse', `Option decomposition failed: ${err.message}. Falling back to raw query.`);
  }

  if (options.length === 0) {
    options = [scenario.question];
  }

  // Deterministic offset based on scenario question to vary fallbacks between different queries
  const offset = scenario.question ? scenario.question.length % ALL_FALLBACK_THEMES.length : 0;

  for (let i = 0; i < count; i++) {
    const theme = ALL_FALLBACK_THEMES[(i + offset) % ALL_FALLBACK_THEMES.length];
    const option = options[i % options.length];
    let skeleton = null;
    let retries = 3;

    while (retries > 0 && !skeleton) {
      const avoidTitles = branches.map(b => `"${b.title}"`).join(', ');
      const avoidStr = branches.length > 0
        ? `CRITICAL INSTRUCTION: You MUST COMPLETELY AVOID the following previously generated branches or anything logically or semantically similar to them: ${avoidTitles}.`
        : '';

      const skeletonPrompt = `
        <instructions>
          Propose a decision branch skeleton for this scenario.
          Branch #${i + 1} of ${count}.
          
          CRITICAL PATHWAY: This branch MUST focus on exploring this specific alternative: "${option}".
          CRITICAL STRATEGIC LENS: The strategy MUST apply this perspective: "${theme}".
          Ensure the title, description, and action are built entirely around this lens.
          
          DO NOT wrap in a JSON array. Output EXACTLY ONE JSON object.
          ${avoidStr}
          Q: ${scenario.question}
          Domain: ${scenario.domain}
          Facts: ${scenario.facts.join(', ')}
        </instructions>
        {"title":"...","description":"...","action":"...","upsidePotential":"one of these: very high | high | moderate | low | very low"}
      `;

      // Slightly increase temperature on retries to encourage diversity
      const temperature = 0.85 + (3 - retries) * 0.05;
      const skeletonResult = await callLLM(skeletonPrompt, temperature);

      if (!skeletonResult) {
        retries--;
        continue;
      }

      let parsed = parseJson(skeletonResult);
      if (!parsed || !parsed.title) {
        retries--;
        continue;
      }

      const currentEmb = await getEmbedding(parsed.title + " " + parsed.action, "xenova");
      let tooSimilar = false;

      for (let j = 0; j < generatedEmbeddings.length; j++) {
        const sim = cosineSimilarity(currentEmb, generatedEmbeddings[j]);
        if (sim > 0.82) { // Similarity threshold
          tooSimilar = true;
          emit('parse', `Discarded similar branch "${parsed.title}" (score: ${sim.toFixed(2)}). Reprompting...`);
          break;
        }
      }

      if (tooSimilar) {
        retries--;
        continue;
      }

      skeleton = parsed;
      generatedEmbeddings.push(currentEmb);
    }

    if (!skeleton) {
      emit('llm_error', `Branch #${i + 1} failed after max retries. Injecting distinct fallback: ${theme}.`);
      skeleton = {
        title: `${theme} Strategy (${option.substring(0, 30)})`,
        description: `An alternative path focusing on ${theme.toLowerCase()} while evaluating "${option}".`,
        action: `Execute procedures strictly aligned with a ${theme.toLowerCase()} framework for "${option}".`,
        upsidePotential: 'moderate'
      };
    }

    const detailsPrompt = `
      <instructions>
        Analytical evaluation for this decision branch. EXACTLY ONE JSON object.
        Keep each item under 1 sentence.
        Q: ${scenario.question} | Branch: ${skeleton.title} - ${skeleton.action}
      </instructions>
      {"hiddenAssumptions":["...","..."],"risks":["...","..."],"successConditions":["...","..."],"failureConditions":["...","..."],"counterfactuals":["...","..."],"fitTags":["..."]}
    `;

    const detailsResult = await callLLM(detailsPrompt, 0.70);
    let details = detailsResult ? parseJson(detailsResult) : null;

    branches.push({
      ...skeleton,
      hiddenAssumptions: ensureArrayOfStrings(details?.hiddenAssumptions),
      risks: ensureArrayOfStrings(details?.risks),
      successConditions: ensureArrayOfStrings(details?.successConditions),
      failureConditions: ensureArrayOfStrings(details?.failureConditions),
      counterfactuals: ensureArrayOfStrings(details?.counterfactuals),
      fitTags: ensureArrayOfStrings(details?.fitTags)
    });
  }

  return branches.map((b, i) => {
    let upside = 50;
    const upStr = String(b.upsidePotential || '').toLowerCase();
    if (upStr.includes('very high')) upside = 90;
    else if (upStr.includes('high')) upside = 75;
    else if (upStr.includes('moderate')) upside = 50;
    else if (upStr.includes('very low')) upside = 10;
    else if (upStr.includes('low')) upside = 25;

    return { ...b, upside, id: `branch_${i + 1}` };
  });
}

export async function proposeGenerativePersonas(scenario, evidence, existingPersonas = [], emit = () => { }, customPersonas = []) {
  const count = Math.max(1, Math.min(8, scenario.personaCount || 2));
  const personas = [];

  if (customPersonas && customPersonas.length > 0) {
    const toInject = customPersonas.slice(0, count);
    personas.push(...toInject);
    emit('generative', `Injected ${toInject.length} user-created custom personas into the pool.`);
  }

  const allExisting = [...(existingPersonas || []), ...personas];
  const existingDesc = allExisting.map(p => `- ${p.name || 'Unknown'} (${p.expertise || p.note || 'General'}, reasoning style: ${p.reasoningStyle || p.cluster || 'Neutral'})`).join('\n');
  const avoidStr = allExisting.length > 0
    ? `Ensure these personas are completely distinct in profile, expertise, occupation, and reasoning style from the existing personas:\n${existingDesc}\nDO NOT duplicate their backgrounds or roles.`
    : '';

  const neededCount = count - personas.length;
  if (neededCount > 0) {
    const prompt = `
      Given the following scenario: ${scenario.question}
      Facts: ${scenario.facts.join(', ')}
      
      Generate exactly ${neededCount} highly distinct "Personas" that represent key stakeholders or opposing viewpoints for this SPECIFIC problem.
      ${avoidStr}
      
      Requirements for these personas:
      1. Make them highly realistic humans with specific location, race, gender, age, expertise, and a 1-sentence bio.
      2. They MUST possess unique reasoning perspectives and specialized knowledge.
      3. CRITICAL DATA INTEGRITY: Do NOT use unescaped double quotes inside your string values. Use single quotes for nicknames or internal quotes (e.g., "Rajesh 'Raj' Kapoor").
      
      Return a JSON ARRAY of exactly ${neededCount} objects matching this schema exactly:
      [
        {
          "name": "Full Name",
          "age": 42,
          "gender": "Male or Female",
          "race": "...",
          "location": "City, Country",
          "expertise": "Field of expertise",
          "reasoningStyle": "data-driven", // Choose one: data-driven, intuitive, systemic, contrarian, historical, ethical, financial, operational
          "bio": "A deep, 2-3 sentence psychological and professional backstory explaining their formative experiences, core motivations, and specific posture regarding this domain.",
          "riskToleranceProfile": "moderate", // Choose one: very high, high, moderate, low, very low
          "evidenceRequirementProfile": "high", // Choose one: very high, high, moderate, low, very low
          "noveltySeekingProfile": "moderate", // Choose one: very high, high, moderate, low, very low
          "clarityNeedProfile": "high" // Choose one: very high, high, moderate, low, very low
        }
      ]
    `;

    const result = await callLLM(prompt, 0.85);
    if (result) {
      emit('llm_raw_persona', `Persona Generation LLM Output:\n${result.substring(0, 150)}...`);
      const parsed = parseJson(result);
      if (parsed) {
        if (Array.isArray(parsed)) {
          personas.push(...parsed);
        } else {
          personas.push(parsed);
        }
      } else {
        emit('llm_error', `Persona JSON parse failed due to malformed LLM output.`);
      }
    } else {
      emit('llm_error', `Persona generation failed (LLM returned empty response).`);
    }
  }

  function mapSpectrum(str, reverse = false) {
    const s = String(str || '').toLowerCase();
    let val = 0.5;
    if (s.includes('very high')) val = 0.9;
    else if (s.includes('high')) val = 0.75;
    else if (s.includes('moderate')) val = 0.5;
    else if (s.includes('very low')) val = 0.1;
    else if (s.includes('low')) val = 0.25;
    return reverse ? 1.0 - val : val;
  }

  const validPersonas = personas.filter(p => p && typeof p === 'object' && !Array.isArray(p));

  return validPersonas.slice(0, count).map(p => {
    const riskBias = typeof p.riskBias === 'number' ? p.riskBias : mapSpectrum(p.riskToleranceProfile, true);
    const evidenceDemand = typeof p.evidenceDemand === 'number' ? p.evidenceDemand : mapSpectrum(p.evidenceRequirementProfile);
    const noveltySeek = typeof p.noveltySeek === 'number' ? p.noveltySeek : mapSpectrum(p.noveltySeekingProfile);
    const clarityNeed = typeof p.clarityNeed === 'number' ? p.clarityNeed : mapSpectrum(p.clarityNeedProfile);
    return {
      ...p,
      name: p.name || 'Anonymous Analyst',
      riskBias,
      evidenceDemand,
      noveltySeek,
      clarityNeed
    };
  });
}

export async function generateCounterfactuals(scenario, branches) {
  const consequences = [];

  // Process one branch at a time to stay well within the 1024 context window
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    let parsed = null;
    let retries = 2;

    while (retries > 0 && !parsed) {
      const prompt = `
        <instructions>
          Perform a rigorous counterfactual stress-test.
          If the core thesis of this branch has a 100% error margin (i.e., absolute failure), compute the cascading structural consequence.
          Output EXACTLY ONE JSON object.
          Q: ${scenario.question.substring(0, 120)}
          Branch: ${b.title}
          Strategy: ${b.description}
          Action: ${b.action}
        </instructions>
        {"branchId":"branch_${i + 1}","title":"${b.title}","ifWrongConsequence":"1 precise, analytical sentence describing the compounding systemic downside"}
      `;

      const result = await callLLM(prompt, 0.7);
      if (result) {
        parsed = parseJson(result);
      }
      if (!parsed || !parsed.ifWrongConsequence) {
        retries--;
        parsed = null;
      }
    }

    if (parsed && parsed.ifWrongConsequence) {
      consequences.push({ branchId: `branch_${i + 1}`, title: b.title, ifWrongConsequence: parsed.ifWrongConsequence });
    } else {
      // Deterministic, mathematically phrased fallback to guarantee the UI never breaks
      consequences.push({
        branchId: `branch_${i + 1}`,
        title: b.title,
        ifWrongConsequence: `A 100% deviation from the expected outcome in ${b.title} results in an unhedged exposure, leading to compounding systemic losses.`
      });
    }
  }

  // Aggregate fields evaluation
  let agg = null;
  let aggRetries = 2;

  while (aggRetries > 0 && !agg) {
    const branchSummaries = branches.map(b => `- ${b.title}: ${b.action}`).join('\n        ');
    const aggPrompt = `
      <instructions>
        Analyze the strategic variance across these branches:
        ${branchSummaries}
        
        Identify the single most expensive assumption (highest mathematical downside risk) and the most survivable failure (lowest systemic blast radius).
        Output EXACTLY ONE JSON object.
      </instructions>
      {"mostExpensiveAssumption":"1 analytical sentence identifying the highest leverage failure point","mostSurvivableFailure":"1 analytical sentence identifying the safest failure state"}
    `;

    const aggResult = await callLLM(aggPrompt, 0.75);
    if (aggResult) {
      agg = parseJson(aggResult);
    }
    if (!agg || !agg.mostExpensiveAssumption || !agg.mostSurvivableFailure) {
      aggRetries--;
      agg = null;
    }
  }

  if (!agg) {
    // Intelligent fallback to prevent 'N/A' display in the UI
    agg = {
      mostExpensiveAssumption: "Assuming linear outcomes in a highly volatile, non-linear environment without adequate risk buffers.",
      mostSurvivableFailure: "A localized failure in tactical execution that leaves the core capital and structural assets strictly intact."
    };
  }

  return {
    branchConsequences: consequences,
    mostExpensiveAssumption: agg.mostExpensiveAssumption,
    mostSurvivableFailure: agg.mostSurvivableFailure
  };
}

export async function proposeGenerativeReactions(persona, branches, scenario, evidence, existingReactions = []) {
  const reactions = [];

  for (const branch of branches) {
    const riskDesc = persona.riskBias > 0.6 ? "You are highly risk-averse and prefer safe, predictable paths." : persona.riskBias < 0.4 ? "You are a risk-taker who favors bold, high-reward moves." : "You take calculated, moderate risks.";
    const evidenceDesc = persona.evidenceDemand > 0.6 ? "You demand hard empirical data and proven facts before acting." : persona.evidenceDemand < 0.4 ? "You trust your intuition and are comfortable acting on incomplete information." : "You balance data with intuition.";
    const noveltyDesc = persona.noveltySeek > 0.6 ? "You actively seek innovative, disruptive, and novel solutions." : persona.noveltySeek < 0.4 ? "You strongly prefer traditional, proven, and conservative methods." : "You are open to new ideas but value established methods.";

    const avoidGroupthinkStr = existingReactions && existingReactions.length > 0
      ? `CRITICAL COMPLIANCE: To ensure independent reasoning and avoid groupthink or repeating identical arguments, review the opinions of other advisors:
         ${JSON.stringify(existingReactions.slice(-3))}
         You MUST offer a unique, distinct perspective, and NOT copy or reuse their points, phrasing, or arguments.`
      : '';

    const prompt = `
      You are an expert strategic simulation model roleplaying as a highly specific stakeholder persona evaluating options for a decision.
      DO NOT use generic AI language, corporate filler, or superficial emotion. Base your stance on epistemological rigor.
      
      Decision Question: ${scenario.question}
      Facts (from the real world / user inputs): ${scenario.facts.join('; ')}
      
      Your Persona:
      Name: ${persona.name}
      Role/Perspective: ${persona.lens || persona.note}
      Background: ${persona.backstory || 'No specific background provided.'}
      Personality Traits:
      - ${riskDesc}
      - ${evidenceDesc}
      - ${noveltyDesc}
      
      Instructions:
      You are roleplaying as this persona — you ARE them. Give your DIRECT personal opinion on whether this branch is a sound strategy for the user.
      Speak in FIRST PERSON as if you are this person giving advice. NEVER refer to yourself in third person.
      
      Branch Title: ${branch.title}
      Branch Description: ${branch.description}
      
      Decide your stance:
      - "support" if it logically aligns with your risk tolerance and evidence demands.
      - "push back" if it violates your thresholds, has clear blindspots, structural risks, or conflicts with your background/values. Do NOT be a yes-man.
      
      CRITICAL RULES FOR "text" (1-2 sentences):
      1. Sound like a real human from your specific demographic/professional background.
      2. Cite at least one specific piece of evidence or fact from the scenario to justify your stance.
      3. Speak in FIRST PERSON as the persona. Never refer to yourself in third person or as a persona/simulation.
      
      ${avoidGroupthinkStr}
      
      Return a JSON object exactly like this:
      {
        "stance": "support", // Choose exactly one: support, push back
        "text": "Your rigorously justified, persona-aligned explanation."
      }
    `;

    const result = await callLLM(prompt, 0.85);
    let parsed = result ? parseJson(result) : null;

    if (result && !parsed) {
      const textLower = result.toLowerCase();
      const inferredStance = textLower.includes('support') && !textLower.includes('push back') ? 'support' 
                           : textLower.includes('push back') && !textLower.includes('support') ? 'push back' 
                           : 'push back';
      parsed = {
        stance: inferredStance,
        text: result.trim()
      };
    }

    const r = parsed || {};
    const finalStance = r.stance === 'support' ? 'support' : 'push back';
    let fallbackText = `${persona.name} rejects this due to misalignment with their risk threshold.`;
    if (finalStance === 'support') fallbackText = `${persona.name} supports this path based on current evidence.`;

    reactions.push({
      branchId: branch.id,
      branch: branch.title,
      stance: finalStance,
      text: r.text || fallbackText
    });
  }

  return reactions;
}

export async function generateExecutiveBrief(scenario, branch, emit = () => { }) {
  const prompt = buildExecutiveBriefPrompt({ scenario, branch });
  const result = await callLLMWithSystem(REPORT_SYSTEM_PROMPT, prompt, 0.7);
  if (!result) {
    emit('llm_error', 'Executive brief LLM returned empty response.');
    return { executiveBrief: 'Proceed with this branch as the optimal path based on available evidence.', councilalFactor: 'Monitor for strong contradictory evidence.' };
  }

  emit('llm_raw_brief', `LLM Output:\n${result.substring(0, 150)}...`);
  const parsed = parseJson(result);

  if (!parsed || !parsed.executiveBrief) {
    emit('llm_parse_error', 'LLM failed to return valid JSON for executive brief.');
  }

  return {
    executiveBrief: parsed?.executiveBrief || 'Proceed with this branch as the optimal path based on available evidence.',
    councilalFactor: parsed?.councilalFactor || 'Monitor for strong contradictory evidence.'
  };
}

export async function resimulateBranch(scenario, branch, newEvidence) {
  const prompt = `
    You are an elite strategic engine governed by the Epistemic-Rigor protocol. 
    Your task is to update a proposed decision branch based on new counter-evidence.
    
    Original Scenario: ${scenario.question}
    Current Branch Title: ${branch.title}
    Current Branch Action: ${branch.action}
    Current Branch Description: ${branch.description}
    Current Objections: ${(branch.objections || []).join('; ')}
    
    NEW COUNTER-EVIDENCE / ARGUMENT FROM USER:
    <user_input>
    ${newEvidence}
    </user_input>
    
    INSTRUCTIONS:
    Do NOT just shallowly paraphrase the old branch with a generic appended sentence.
    You must dynamically restructure the logic of the branch. 
    1. Analyze the core mechanism of the user's argument. Is it valid? Does it introduce a new vulnerability?
    2. Adjust the Action to logically incorporate this new constraint or reality.
    3. Update the description to reflect the strategic shift.
    4. Generate specific, rigorous new objections that challenge this *new* updated path.
    
    Return JSON format exactly like this:
    {
      "title": "Updated Title",
      "description": "Updated Description incorporating the new reality.",
      "action": "Updated specific action to take.",
      "objections": [
        "Updated, rigorous objection 1",
        "Updated, rigorous objection 2"
      ]
    }
  `;

  const result = await callLLM(prompt, 0.8);
  if (!result) return branch;

  const parsed = parseJson(result);
  if (!parsed) return branch;

  return {
    ...branch,
    title: parsed.title || branch.title,
    description: parsed.description || branch.description,
    action: parsed.action || branch.action,
    objections: parsed.objections || branch.objections
  };
}

/**
 * Cross-examination interview for undecided personas.
 * Called when a persona returns 'wait' on a branch.
 * Confronts them with the strongest supporting and opposing arguments
 * from other personas and forces them to commit to a firm stance.
 *
/**
 * Cross-examines a persona with a Judge's targeted question.
 * @param {object} persona          - the persona
 * @param {object} branch           - the branch being evaluated
 * @param {object} scenario         - the global scenario
 * @param {object} initialReaction  - the persona's initial stance and reasoning
 * @returns {{ branchId, stance, judgeQuestion, personaResponse, finalStance }}
 */
export async function conductCrossExamination(persona, branch, scenario, initialReaction) {
  const initialStance = initialReaction?.stance || 'push back';
  const initialText = initialReaction?.text || 'No initial argument.';

  const prompt = `
    You are an elite strategic Judge conducting a cross-examination.
    
    Context Question: ${scenario.question}
    
    Persona Being Cross-Examined: ${persona.name}
    Persona's Background: ${persona.bio || persona.backstory || 'Expert'}
    Persona's Risk Bias: ${persona.riskBias ?? 0.5}
    Persona's Evidence Demand: ${persona.evidenceDemand ?? 0.5}
    
    Branch Under Evaluation: "${branch.title}"
    Branch Description: ${branch.description}
    
    Persona's Initial Stance: ${initialStance.toUpperCase()}
    Persona's Initial Argument: "${initialText}"
    
    INSTRUCTIONS:
    1. The Persona is roleplaying as themselves — they ARE this person giving advice. They speak in FIRST PERSON and NEVER refer to themselves in third person.
    2. Formulate ONE highly specific, penetrating "Judge Question" that challenges the persona's advisory stance on this branch. Explore a blind spot, hidden bias, or counterfactual in their initial argument. NEVER explicitly mention the persona's numerical parameters (like "risk bias of 0.1").
    3. Then, simulate the Persona's direct first-person answer to that exact question, defending or modifying their advice while staying strictly in character. The Persona must also NEVER explicitly state their numeric parameters.
    4. The Persona must then declare their FINAL committed stance ("support" or "push back") on whether the user should take this path.
    
    Return ONLY valid JSON. No markdown.
    {
      "judgeQuestion": "1-2 sentences. The targeted, unique question exploring the persona's bias/counterfactuals.",
      "personaResponse": "2-3 sentences. The persona answering the judge directly.",
      "finalStance": "support" // Choose exactly one: support, push back
    }
  `;

  const result = await callLLM(prompt, 0.8);
  if (!result) {
    return { branchId: branch.id, stance: initialStance, judgeQuestion: 'Could not generate cross-examination.', personaResponse: 'No response recorded.', finalStance: initialStance };
  }

  let parsed = parseJson(result);
  if (!parsed) {
    const textLower = result.toLowerCase();
    const inferredStance = textLower.includes('support') && !textLower.includes('push back') ? 'support' 
                         : textLower.includes('push back') && !textLower.includes('support') ? 'push back' 
                         : initialStance;
    parsed = {
      judgeQuestion: 'Please clarify your definitive position.',
      personaResponse: result.trim(),
      finalStance: inferredStance
    };
  }

  if (!['support', 'push back'].includes(parsed.finalStance)) {
    parsed.finalStance = initialStance;
  }

  return {
    branchId: branch.id,
    stance: parsed.finalStance,
    judgeQuestion: parsed.judgeQuestion || 'Question not provided.',
    personaResponse: parsed.personaResponse || 'No response provided.',
    finalStance: parsed.finalStance
  };
}


export async function generateCustomPersonaFromDescription(description) {
  const prompt = `
    You are an expert character and persona designer for a sophisticated strategic simulation.
    The user has provided a custom description for a persona they want to inject into their simulation.
    
    User Description: "${description}"
    
    Requirements for this persona:
    1. Make them a highly realistic human with specific location, race, gender, age, expertise, and a 1-sentence bio reflecting the user's description.
    2. They MUST possess a unique reasoning perspective and specialized knowledge.
    3. Map their described traits to the strict profiles below.
    
    Return a single JSON object matching this schema exactly. Choose exactly one value where choices are provided:
    {
      "name": "Full Name",
      "age": 42,
      "gender": "Male or Female",
      "race": "...",
      "location": "City, Country",
      "expertise": "Field of expertise",
      "reasoningStyle": "data-driven", // Choose one: data-driven, intuitive, systemic, contrarian, historical, ethical, financial, operational
      "bio": "A deep, 2-3 sentence psychological and professional backstory explaining their formative experiences and core motivations.",
      "riskToleranceProfile": "moderate", // Choose one: very high, high, moderate, low, very low
      "evidenceRequirementProfile": "high", // Choose one: very high, high, moderate, low, very low
      "noveltySeekingProfile": "moderate", // Choose one: very high, high, moderate, low, very low
      "clarityNeedProfile": "high" // Choose one: very high, high, moderate, low, very low
    }
  `;

  const result = await callLLM(prompt, 0.7);
  if (!result) throw new Error('LLM failed to generate a persona.');

  const parsed = parseJson(result);
  if (!parsed || !parsed.name) throw new Error('LLM generated an invalid persona schema.');

  function mapSpectrum(str, reverse = false) {
    const s = String(str || '').toLowerCase();
    let val = 0.5;
    if (s.includes('very high')) val = 0.9;
    else if (s.includes('high')) val = 0.75;
    else if (s.includes('moderate')) val = 0.5;
    else if (s.includes('very low')) val = 0.1;
    else if (s.includes('low')) val = 0.25;
    return reverse ? 1.0 - val : val;
  }

  const riskBias = typeof parsed.riskBias === 'number' ? parsed.riskBias : mapSpectrum(parsed.riskToleranceProfile, true);
  const evidenceDemand = typeof parsed.evidenceDemand === 'number' ? parsed.evidenceDemand : mapSpectrum(parsed.evidenceRequirementProfile);
  const noveltySeek = typeof parsed.noveltySeek === 'number' ? parsed.noveltySeek : mapSpectrum(parsed.noveltySeekingProfile);
  const clarityNeed = typeof parsed.clarityNeed === 'number' ? parsed.clarityNeed : mapSpectrum(parsed.clarityNeedProfile);

  return {
    ...parsed,
    riskBias,
    evidenceDemand,
    noveltySeek,
    clarityNeed

  };
}
