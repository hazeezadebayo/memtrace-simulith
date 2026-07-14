import { safeStringify } from '../utils/tree_runtime_utils.js';

export function buildSynthesisPrompt({ scenario, pl, allInterviewsText }) {
  return `
You are the Mesh Qualitative Synthesis Reporter.
Analyze the following post-simulation interviews conducted with the personas:

Scenario under review: "${scenario.question}"
Factual Context: ${(scenario.facts || []).join('; ').slice(0, pl.facts)}

INTERVIEW TRANSCRIPTS:
${allInterviewsText}

Compile a comprehensive qualitative synthesis report. Focus on:
1. Key counterfactual insights: How do agents react to hypothetical shifts or alternative policy paths?
2. Hidden consensus or deep-seated dissent that didn't fully surface on social media.
3. Factional vulnerabilities and strategic trade-offs explored during the interviews.

Write a detailed, structured analysis. Keep it professional, objective, and under 300 words. Do not use placeholders.
`.trim();
}

export function buildVerdictPrompt({
  scenarioQuestion, scenarioFacts, activeDomain, cleanTopicName,
  supportiveWeight, supportiveSummary, skepticalWeight,
  skepticalSummary, interviewSection
}) {
  return `
You are the Mesh Intelligence Verdict Synthesizer.
Analyze the following simulation results:

<scenario_question>${scenarioQuestion}</scenario_question>
<factual_context>
${scenarioFacts}
</factual_context>
<active_domain>${activeDomain}</active_domain>
<topic_under_review>${cleanTopicName}</topic_under_review>

<supportive_camp weight="${supportiveWeight.toFixed(2)}">
${supportiveSummary}
</supportive_camp>

<skeptical_camp weight="${skepticalWeight.toFixed(2)}">
${skepticalSummary}
</skeptical_camp>
${interviewSection}
SYSTEMIC VERDICT DETERMINATION:
- If Supportive Weight (${supportiveWeight.toFixed(2)}) is significantly larger, pick the Supportive camp as the victor.
- If Skeptical Weight (${skepticalWeight.toFixed(2)}) is significantly larger, pick the Skeptical camp as the victor.
- If they are extremely close, choose based on the core structural conflict (Systemic Deadlock).

INSTRUCTIONS:
1. First, use a 3-sentence <think> block to explicitly list what is a FACT (from factual_context) vs what is a HYPOTHESIS (from hypothetical_interviews).
2. Synthesize a single, definitive, professional paragraph (max 3 sentences) explaining the mesh's decision/verdict. You MUST pick a definitive victor/direction based on the systemic weights above.
3. Reference the key driving faction brokers and their primary arguments.
4. IMPORTANT: Do NOT invent or hallucinate facts, numbers, or conditions that were not in the original factual_context. Use the hypothetical_interviews ONLY to understand agent nuance and edge cases, but do NOT present hypothetical conditions (like fake funds or mentors) as established facts of the main verdict. Speak with authority and senior-level analysis.
`.trim();
}

export function buildExecutiveBriefPrompt({ scenario, branch }) {
  return `
    You are a premium strategic advisor providing a $10,000 consultation summary.
    
    Context Question: ${scenario.question}
    Domain: ${scenario.domain}
    Audience: ${scenario.audience}
    
    The recommended action is:
    Title: ${branch.title}
    Action: ${branch.action}
    Why it was chosen (raw data): ${branch.why?.join(', ')}
    
    Write a highly professional, bespoke, and compelling "Strategic Directive" (2-3 sentences) explaining why this is the optimal path. Do NOT use generic AI language or list raw data. Be authoritative and insightful.
    Also provide a separate "Councilal Vulnerability" (1 sentence) identifying what specific new information or event would invalidate this strategy.
    
    Return JSON format exactly like this:
    {
      "executiveBrief": "...",
      "councilalFactor": "..."
    }
  `;
}

export function buildDominantFuturesPrompt({ decision, pathDescriptors }) {
  return `You are the Decision Interpreter for a causal forecasting system.

A user asked: ${JSON.stringify(decision)}

The simulation has computed ${pathDescriptors.length} dominant futures.

Write a distinct narrative for each future. The fields must be different across futures whenever the path content differs.
Signal must be an observable indicator, not a restatement of the action.
Action must be a concrete step the user can take now, not a prediction.
Do not reuse the same phrasing across multiple futures.
Do not use generic placeholders.
Do not use titles like "Future 1" or "Scenario A".

COMPUTED FUTURES:
${safeStringify(pathDescriptors, "[]")}

Return a JSON array of objects, one object per future.
Each object must have exactly these keys:
- title: A highly distinct and specific 5-8 word headline that highlights the unique final step or differentiating theme of this future
- probability_label: e.g. "Very Likely (78%)" or "Possible (34%)"
- outcome: 2-3 sentences in plain, direct language describing what this future looks like for the user
- main_risk: One specific sentence naming the biggest danger in this path
- main_upside: One specific sentence naming the best opportunity in this path
- signal: One observable thing the user can watch to know this future is unfolding
- action: One concrete thing the user could do RIGHT NOW to navigate this future
- sentiment: "positive", "negative", or "neutral"

Return ONLY valid JSON.`;
}

export function buildDecisionSpacePrompt({ decision, context, existingVarNames, existingOpNames, existingStakeholders }) {
  return `You are the Decision Space Adapter for a causal simulation engine.

Your job has two parts:

PART A — Human Labels
Map every existing variable, operator, and stakeholder ID to a short, plain-English
human-readable label (3-6 words max). Users are not engineers. No snake_case. No jargon.

PART B — Query-Specific Additions (Optional)
If the user decision has important factors that are NOT captured by the existing variables/operators/stakeholders,
add up to 3 new variables, 3 new operators, and 2 new stakeholders.
Each new variable must have: min (0), max (1), defaultValue (0-1), and a plain description.
Each new operator must have: description (plain English), base_effects (object mapping variable names to {magnitude, elasticity}), dynamic_effects (array of variable names).
New operator base_effects MUST only reference variables that exist in the existing OR new variable lists.

USER DECISION:
${JSON.stringify(String(decision ?? ""))}

CONTEXT:
${JSON.stringify(String(context ?? ""))}

EXISTING VARIABLES:
${safeStringify(existingVarNames, "[]")}

EXISTING OPERATORS:
${safeStringify(existingOpNames, "[]")}

EXISTING STAKEHOLDERS:
${safeStringify(existingStakeholders, "[]")}

Return ONLY valid JSON with this exact structure:
{
  "decision_summary": "one sentence describing the decision in plain English",
  "variable_labels": {
    "existing_var_id": "Human Readable Label",
    ...
  },
  "operator_labels": {
    "existing_op_id": "Human Readable Description",
    ...
  },
  "stakeholder_labels": {
    "existing_stakeholder_id": "Human Readable Name",
    ...
  },
  "variables": {
    "new_var_id": { "min": 0, "max": 1, "defaultValue": 0.5, "description": "..." }
  },
  "operators": {
    "new_op_id": { "description": "...", "base_effects": {}, "dynamic_effects": [] }
  },
  "stakeholders": [],
  "interactions": []
}

If no additions are needed, leave "variables", "operators", "stakeholders", "interactions" as empty objects/arrays.`;
}

export function buildDivergenceSynthesisPrompt({ councilSummary, meshSummary, treeSummary }) {
  return `You are the MemTrace Reality Divergence Engine.
Your purpose is to explicitly embrace contradiction. You have run the same scenario through three incompatible future simulation physics (Council, Mesh, and Tree).

The system does NOT reconcile these futures. Instead, it tracks divergence as a signal.
You are a tool for detecting instability in narratives and plans.

Here are the raw summaries of the three simulations:

### Council Mode (Normative reasoning & Stakeholder reactions)
${councilSummary}

### Mesh Mode (Emergent truth & Population belief contagion)
${meshSummary}

### Tree Mode (Causal optimization & Expected utility paths)
${treeSummary}

Your Task:
Expose the hidden uncertainties and incompatibilities across these three models. Write a structured, professional comparative synthesis report in Markdown.
Do not reconcile the modes, do not find a middle ground, and do not average the answers. Let the contradictions stand. You must structure the report with these exact section headings:

# Reality Divergence Synthesis Report

## 1. Divergence Signal Analysis
Compare the outcomes directly. Explain how the causal physics of the Tree (expected utility) contradicts the social reality of the Mesh (belief contagion) and/or the normative logic of the Council (stakeholder consensus). Be specific: cite conflicting outcomes, stance values, and stakeholder positions.

## 2. Instability & Plan Vulnerabilities
Identify which parts of the proposed plan are most vulnerable to these contradictions. Focus on friction points where stakeholder rejection, public belief shifts, or causal chain failures create critical exposure.

## 3. The Uncertainty Moat
Synthesize the boundaries of what is knowable vs. unknowable based on this divergence. Outline the key risk anchors that the planner must monitor.

IMPORTANT: Your analysis must be grounded purely in the provided simulation data. Do not invent external facts, or default to general descriptions. Avoid circular narratives that restate the task. Keep it concise, authoritative, and analytical.
`;
}
