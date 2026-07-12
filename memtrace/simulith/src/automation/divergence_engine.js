import { callLLM } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { runCouncil, runMesh, runTree, setAutomationState, logAutomation, clearAutomationLogs, isCancellationError } from './utils.js';

const SYNTHESIS_PROMPT = `You are the MemTrace Reality Divergence Engine.
Your purpose is to explicitly embrace contradiction. You have run the same scenario through three incompatible future simulation physics (Council, Mesh, and Tree).

The system does NOT reconcile these futures. Instead, it tracks divergence as a signal.
You are a tool for detecting instability in narratives and plans.

Here are the raw summaries of the three simulations:

### Council Mode (Normative reasoning & Stakeholder reactions)
{COUNCIL_SUMMARY}

### Mesh Mode (Emergent truth & Population belief contagion)
{MESH_SUMMARY}

### Tree Mode (Causal optimization & Expected utility paths)
{TREE_SUMMARY}

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

export async function runDivergenceAnalysis(baseUrl, token, payload, runSequentially = true, signal) {
  const query = payload.question || payload.decision || '';
  if (!query) throw new Error('Query is required for Divergence Mode.');

  // Propagate abort immediately if already cancelled
  if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

  clearAutomationLogs(payload.uuid);
  logAutomation(payload.uuid, 'divergence', 'Starting reality divergence analysis...');

  console.log(`[Divergence Engine] Starting divergence analysis (Sequential: ${runSequentially})`);

  let councilResult, meshResult, treeResult;

  if (runSequentially) {
    if (signal?.aborted) throw new Error('Simulation Cancelled by user.');
    setAutomationState(payload.uuid, 'RUNNING: COUNCIL MODE');
    logAutomation(payload.uuid, 'divergence', 'Running Council Mode...');
    console.log('[Divergence Engine] Running Council Mode...');
    try { 
      councilResult = await runCouncil(baseUrl, token, payload, signal); 
      logAutomation(payload.uuid, 'divergence', councilResult.error ? `Council Mode failed: ${councilResult.error}` : 'Council Mode completed.');
    } catch(e) { 
      if (isCancellationError(e, signal)) throw e;
      councilResult = { error: e.message }; 
      logAutomation(payload.uuid, 'divergence', `Council Mode failed: ${e.message}`);
    }
    
    if (signal?.aborted) throw new Error('Simulation Cancelled by user.');
    setAutomationState(payload.uuid, 'RUNNING: MESH MODE');
    logAutomation(payload.uuid, 'divergence', 'Running Mesh Mode...');
    console.log('[Divergence Engine] Running Mesh Mode...');
    try { 
      meshResult = await runMesh(baseUrl, token, payload, signal); 
      logAutomation(payload.uuid, 'divergence', meshResult.error ? `Mesh Mode failed: ${meshResult.error}` : 'Mesh Mode completed.');
    } catch(e) { 
      if (isCancellationError(e, signal)) throw e;
      meshResult = { error: e.message }; 
      logAutomation(payload.uuid, 'divergence', `Mesh Mode failed: ${e.message}`);
    }
    
    if (signal?.aborted) throw new Error('Simulation Cancelled by user.');
    setAutomationState(payload.uuid, 'RUNNING: TREE MODE');
    logAutomation(payload.uuid, 'divergence', 'Running Tree Mode...');
    console.log('[Divergence Engine] Running Tree Mode...');
    try { 
      treeResult = await runTree(baseUrl, token, payload, signal); 
      logAutomation(payload.uuid, 'divergence', treeResult.error ? `Tree Mode failed: ${treeResult.error}` : 'Tree Mode completed.');
    } catch(e) { 
      if (isCancellationError(e, signal)) throw e;
      treeResult = { error: e.message }; 
      logAutomation(payload.uuid, 'divergence', `Tree Mode failed: ${e.message}`);
    }
  } else {
    let cState = 'RUNNING', mState = 'RUNNING', tState = 'RUNNING';
    const updateParallelState = () => setAutomationState(payload.uuid, `C: ${cState} | M: ${mState} | T: ${tState}`);
    updateParallelState();

    logAutomation(payload.uuid, 'divergence', 'Running all realities (Council, Mesh, Tree) in parallel...');
    console.log('[Divergence Engine] Running All Modes in Parallel...');
    const results = await Promise.allSettled([
      runCouncil(baseUrl, token, payload, signal).then(r => { 
        cState = 'DONE'; 
        updateParallelState(); 
        logAutomation(payload.uuid, 'divergence', 'Council Mode completed.');
        return r; 
      }).catch(e => {
        cState = 'FAILED';
        updateParallelState();
        logAutomation(payload.uuid, 'divergence', `Council Mode failed: ${e.message}`);
        throw e;
      }),
      runMesh(baseUrl, token, payload, signal).then(r => { 
        mState = 'DONE'; 
        updateParallelState(); 
        logAutomation(payload.uuid, 'divergence', 'Mesh Mode completed.');
        return r; 
      }).catch(e => {
        mState = 'FAILED';
        updateParallelState();
        logAutomation(payload.uuid, 'divergence', `Mesh Mode failed: ${e.message}`);
        throw e;
      }),
      runTree(baseUrl, token, payload, signal).then(r => { 
        tState = 'DONE'; 
        updateParallelState(); 
        logAutomation(payload.uuid, 'divergence', 'Tree Mode completed.');
        return r; 
      }).catch(e => {
        tState = 'FAILED';
        updateParallelState();
        logAutomation(payload.uuid, 'divergence', `Tree Mode failed: ${e.message}`);
        throw e;
      })
    ]);
    
    // If cancelled, surface it instead of continuing to synthesis
    const abortedResult = results.find(r => r.status === 'rejected' && isCancellationError(r.reason, signal));
    if (abortedResult) throw new Error('Simulation Cancelled by user.');
    
    councilResult = results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason?.message };
    meshResult = results[1].status === 'fulfilled' ? results[1].value : { error: results[1].reason?.message };
    treeResult = results[2].status === 'fulfilled' ? results[2].value : { error: results[2].reason?.message };
  }

  // Extract summaries to feed into the synthesis LLM
  const councilSummary = councilResult.error ? `Error: ${councilResult.error}` : 
    JSON.stringify({
      recommendation: {
        title: councilResult.recommendation?.title,
        reason: councilResult.recommendation?.reason,
        whatWouldChangeMyMind: councilResult.recommendation?.whatWouldChangeMyMind
      },
      top_branch: councilResult.branches?.[0]?.title,
      confidence: councilResult.branches?.[0]?.confidence
    });

  const meshSummary = meshResult.error ? `Error: ${meshResult.error}` : 
    JSON.stringify({
      verdict_stance: meshResult.report?.verdict?.stance,
      verdict_summary: meshResult.report?.verdict?.summary,
      loudest_concern: meshResult.report?.verdict?.loudestConcern?.concern,
      agents_engaged: meshResult.agents?.length
    });

  const treeSummary = treeResult.error ? `Error: ${treeResult.error}` : 
    JSON.stringify({
      dominant_futures: treeResult.dominantFutures?.map(f => ({
        title: f.title,
        outcome: f.outcome,
        main_risk: f.main_risk,
        main_upside: f.main_upside,
        signal: f.signal,
        action: f.action
      })),
      decision_space: treeResult.decisionSpace?.decision_summary
    });

  const prompt = SYNTHESIS_PROMPT
    .replace('{COUNCIL_SUMMARY}', councilSummary)
    .replace('{MESH_SUMMARY}', meshSummary)
    .replace('{TREE_SUMMARY}', treeSummary);

  setAutomationState(payload.uuid, 'SYNTHESIZING DIVERGENCE REPORT...');
  logAutomation(payload.uuid, 'divergence', 'Synthesizing reality divergence report...');
  console.log('[Divergence Engine] Synthesizing divergence signal...');
  
  if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

  let synthesisReport;
  try {
    synthesisReport = await callLLM(prompt);
    logAutomation(payload.uuid, 'divergence', 'Divergence report synthesis completed.');
  } catch (e) {
    if (isCancellationError(e, signal)) throw e;
    synthesisReport = `Divergence report synthesis failed: ${e.message}`;
    logAutomation(payload.uuid, 'error', `Synthesis failed: ${e.message}`);
  }

  setAutomationState(payload.uuid, 'COMPLETED');
  logAutomation(payload.uuid, 'divergence', 'Divergence analysis completed.');

  return {
    synthesis_report: synthesisReport,
    raw_results: {
      council: councilResult,
      mesh: meshResult,
      tree: treeResult
    }
  };
}

