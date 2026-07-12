import express from 'express';
import { authenticate, enforceOrigin } from './auth_server.js';
import { getUser } from './db_users.js';
import { loadState, saveState, recenterPersona } from '../simulith/src/utils/council_utils.js';
import { getLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';
import { queue, safeNumber, orchestratorConfig } from './simulith_server.js';
import { DEFAULT_CONFIG } from '../extension/env/config.js';

const router = express.Router();
router.use(enforceOrigin);

router.post('/simulate/council', authenticate, async (req, res) => {
  try {
    const payload = { ...req.body, uuid: req.user.uuid };
    
    // Guardrail Check
    const combinedInput = `${payload.question || ''} ${payload.facts || ''} ${payload.domain || ''}`;
    const isSafe = await checkInjectionGuardrail(combinedInput);
    if (!isSafe.safe) {
      return res.status(403).json({ error: isSafe.reason || 'Input blocked by security guardrails.' });
    }

    // Token Forecasting
    const user = await getUser(req.user.uuid);
    const state = await loadState(req.user.uuid);
    const branchCount = safeNumber(payload.branchCount ?? state.settings?.branchCount, 4, DEFAULT_CONFIG.LIMITS.council.minBranches, DEFAULT_CONFIG.LIMITS.council.maxBranches);
    const personaCount = safeNumber(payload.personaCount ?? state.settings?.personaCount, 4, DEFAULT_CONFIG.LIMITS.council.minPersonas, DEFAULT_CONFIG.LIMITS.council.maxPersonas);
    const forecasted = (personaCount * branchCount) + 5;

    if (!user || user.tokens < forecasted) {
      return res.status(402).json({ error: `Insufficient tokens. Forecasted requirement is ${forecasted} tokens, but you only have ${user?.tokens || 0}.` });
    }

    const job = queue.enqueue(payload);
    res.status(202).json({ jobId: job.id, status: job.status, pollUrl: `/api/v4/jobs/${job.id}` });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Simulation failed' });
  }
});

router.get('/jobs/:id', authenticate, (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (job.payload.uuid !== req.user.uuid) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (job.status === 'running') {
    job.llmCallCount = getLLMCallCount();
  }
  res.json(job);
});

router.delete('/jobs/:id', authenticate, (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.payload.uuid !== req.user.uuid) return res.status(403).json({ error: 'Access denied' });
  const success = queue.cancel(req.params.id);
  res.json({ success, status: job.status });
});

router.post('/runs/:id/branches/:branchId/resimulate', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    const runId = req.params.id;
    const branchId = req.params.branchId;
    const newEvidence = req.body.newEvidence;
    
    if (!newEvidence) return res.status(400).json({ error: 'newEvidence is required' });

    const run = (state.runs || []).find(item => item.id === runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    
    const branchIndex = run.branches.findIndex(b => b.id === branchId);
    if (branchIndex < 0) return res.status(404).json({ error: 'Branch not found' });

    const { resimulateBranch, proposeGenerativeReactions } = await import('../simulith/src/agents/generative.js');
    const { scoreBranches } = await import('../simulith/src/engine/scoring.js');
    
    // 1. Resimulate the logic
    const updatedBranch = await resimulateBranch(run.scenario, run.branches[branchIndex], newEvidence);
    
    // Merge back the structural IDs and base properties
    const mergedBranch = { ...run.branches[branchIndex], ...updatedBranch };

    // Extract the correct personas array (newer Council format uses run.population.personas, older used run.mesh)
    const runPersonas = (run.population && run.population.personas) || run.mesh || [];
    const runEvidence = run.evidence || run.evidenceProfile;

    // 2. Re-trigger Stakeholder Deliberation for the new reality
    if (runPersonas.length > 0) {
      const { conductCrossExamination } = await import('../simulith/src/agents/generative.js');
      
      const rawPopulation = [];
      for (const persona of runPersonas) {
        const existingReactions = rawPopulation.map(p => {
          const r = (p.reactions || []).find(rx => rx.branchId === branchId);
          return {
            persona: p.name,
            reactions: r ? [{ branch: mergedBranch.title, stance: r.stance, argument: r.text }] : []
          };
        }).filter(item => item.reactions.length > 0);

        const newReactions = await proposeGenerativeReactions(persona, [mergedBranch], run.scenario, null, existingReactions);
        if (newReactions && newReactions.length > 0) {
          if (!persona.reactions) persona.reactions = [];
          const reactionIndex = persona.reactions.findIndex(r => r.branchId === branchId);
          if (reactionIndex >= 0) {
            persona.reactions[reactionIndex] = newReactions[0];
          } else {
            persona.reactions.push(newReactions[0]);
          }
        }
        // Re-run cross examination if they return wait
        const updatedReaction = persona.reactions.find(r => r.branchId === branchId);
        if (updatedReaction && (updatedReaction.stance === 'wait' || updatedReaction.stance === 'undecided')) {
           const interviewed = await conductCrossExamination(persona, mergedBranch, run.scenario, updatedReaction);
           Object.assign(persona, interviewed);
           updatedReaction.stance = interviewed.stance;
           updatedReaction.text = interviewed.personaResponse;
        }
        rawPopulation.push(persona);
      }
    }

    // 3. Re-Score the branch using the updated stakeholder reactions
    // We pass [mergedBranch] and the full run context to properly calculate confidence and risk
    const [scoredBranch] = scoreBranches(
      [mergedBranch], 
      run.scenario, 
      runEvidence, 
      run.contradictionGraph || { items: [] }, 
      runPersonas, 
      run.settings
    );

    run.branches[branchIndex] = scoredBranch;
    await saveState(req.user.uuid, state);
    
    res.json({ ok: true, updatedBranch: scoredBranch });
  } catch (error) {
    console.error('🚨 RESIMULATE ROUTE ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to resimulate branch' });
  }
});

router.post('/runs/:id/branches/:branchId/ingest', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    const runId = req.params.id;
    const branchId = req.params.branchId;

    const run = (state.runs || []).find(item => item.id === runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    
    const branchIndex = run.branches.findIndex(b => b.id === branchId);
    if (branchIndex < 0) return res.status(404).json({ error: 'Branch not found' });

    const branch = run.branches[branchIndex];

    if (orchestratorConfig.orchestrator) {
      const outcomeText = `Council Mode Branch Knowledge Extraction:
Question: ${run.scenario.question}
Domain: ${run.scenario.domain}
Branch ID: ${branch.id}
Branch Rank: ${branch.rank}
Confidence: ${branch.confidence}%
Hypothesis/Title: ${branch.title}
Reasoning: ${branch.reason}
Vulnerability/What Would Change My Mind: ${branch.whatWouldChangeMyMind}
New Evidence/Resimulations: ${branch.evidenceLinks ? branch.evidenceLinks.map(e => e.title).join(', ') : 'None'}`;
      
      const urn = `memtrace:council:knowledge:${branchId}`;
      
      await orchestratorConfig.orchestrator.ingest(outcomeText, urn, req.user.uuid);
      console.log(`[Council Router] Ingested branch ${branchId} as knowledge.`);
      return res.json({ ok: true, ingestedUrn: urn });
    } else {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to ingest branch' });
  }
});

export default router;
