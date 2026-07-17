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
    
    // Token Forecasting
    const user = await getUser(req.user.uuid);
    const state = await loadState(req.user.uuid);
    const branchCount = safeNumber(payload.branchCount ?? state.settings?.branchCount, 4, DEFAULT_CONFIG.LIMITS.council.minBranches, DEFAULT_CONFIG.LIMITS.council.maxBranches);
    const personaCount = safeNumber(payload.personaCount ?? state.settings?.personaCount, 4, DEFAULT_CONFIG.LIMITS.council.minPersonas, DEFAULT_CONFIG.LIMITS.council.maxPersonas);
    const forecasted = (personaCount * branchCount) + 5;

    if (!user || user.tokens < forecasted) {
      return res.status(402).json({ error: `Insufficient tokens. Forecasted requirement is ${forecasted} tokens, but you only have ${user?.tokens || 0}.` });
    }

    // Guardrail Check
    const combinedInput = `${payload.question || ''} ${payload.facts || ''} ${payload.domain || ''}`;
    const isSafe = await checkInjectionGuardrail(combinedInput);
    if (!isSafe.safe) {
      return res.status(403).json({ error: isSafe.reason || 'Input blocked by security guardrails.' });
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

    // Enqueue the resimulation job
    const jobPayload = {
      type: 'resimulate',
      runId: runId,
      branchId: branchId,
      newEvidence: newEvidence,
      uuid: req.user.uuid
    };
    
    const job = queue.enqueue(jobPayload);
    res.status(202).json({ jobId: job.id, status: job.status, pollUrl: `/api/v4/jobs/${job.id}` });
  } catch (error) {
    console.error('🚨 RESIMULATE ROUTE ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to queue resimulate branch' });
  }
});

router.post('/runs/:id/branches/:branchId/ingest', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    const runId = req.params.id;
    const branchId = req.params.branchId;

    const run = (state.runs || []).find(item => item.id === runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (!run.branches || !Array.isArray(run.branches)) {
      return res.status(500).json({ error: 'Run has no branches array' });
    }
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
Reasoning: ${branch.reason ?? ''}
Vulnerability/What Would Change My Mind: ${branch.whatWouldChangeMyMind ?? ''}
New Evidence/Resimulations: ${branch.evidenceLinks ? branch.evidenceLinks.map(e => e.title).join(', ') : 'None'}`;
      
      const urn = `memtrace:council:knowledge:${branchId}`;
      
      await orchestratorConfig.orchestrator.ingest(outcomeText, urn, req.user.uuid);
      console.log(`[Council Router] Ingested branch ${branchId} as knowledge.`);
      return res.json({ ok: true, ingestedUrn: urn });
    } else {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }
  } catch (error) {
    console.error('🚨 INGEST ROUTE ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to ingest branch' });
  }
});

export default router;
