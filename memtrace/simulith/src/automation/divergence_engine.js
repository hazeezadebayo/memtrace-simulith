import { buildDivergenceSynthesisPrompt } from '../llm/prompts.js';
import { callLLMWithSystem, REPORT_SYSTEM_PROMPT } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { runCouncil, runMesh, runTree, setAutomationState, logAutomation, clearAutomationLogs, getAutomationLogs, isCancellationError } from './utils.js';

export async function runDivergenceAnalysis(baseUrl, token, payload, runSequentially = true, signal) {
  const query = payload.question || payload.decision || '';
  if (!query) throw new Error('Query is required for Divergence Mode.');

  // Propagate abort immediately if already cancelled
  if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

  const priorLogs = getAutomationLogs(payload.uuid);
  clearAutomationLogs(payload.uuid);
  priorLogs.forEach(l => logAutomation(payload.uuid, l.stage, l.message, l.details));
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

  const prompt = buildDivergenceSynthesisPrompt({ councilSummary, meshSummary, treeSummary });

  setAutomationState(payload.uuid, 'SYNTHESIZING DIVERGENCE REPORT...');
  logAutomation(payload.uuid, 'divergence', 'Synthesizing reality divergence report...');
  console.log('[Divergence Engine] Synthesizing divergence signal...');
  
  if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

  let synthesisReport;
  try {
    synthesisReport = await callLLMWithSystem(REPORT_SYSTEM_PROMPT, prompt);
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

