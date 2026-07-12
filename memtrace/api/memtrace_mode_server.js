import express from 'express';
import { authenticate } from './auth_server.js';
import { JobQueue } from '../simulith/src/utils/queue.js';
import { getLLMCallCount, resetLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';
import { orchestratorConfig } from './simulith_server.js';

const router = express.Router();

// --- MemTrace API Endpoints ---
export const memtraceQueue = new JobQueue({
  retries: 3,
  backoffMs: 500,
  processJob: async (payload, emit, job) => {
    resetLLMCallCount();
    try {
      let facts = payload.facts || [];
      
      if (payload.uuid && orchestratorConfig.orchestrator) {
        emit('Memory Search', 'Retrieving context from MemTrace base for MemTrace...');
        try {
          const hits = await orchestratorConfig.orchestrator.search(payload.uuid, payload.question);
          const topHits = hits.slice(0, 2);
          const retrievedFacts = topHits.map((hit, index) => {
            const rawText = hit.chunk.chunk || hit.chunk.text || '';
            const summaryText = hit.chunk.summary || '';
    
            console.log(`\n--- [RAG FETCH: MEMTRACE (Hit ${index + 1})] ---`);
            console.log(`Raw Length: ${rawText.length} chars | Summary Length: ${summaryText.length} chars`);
            console.log(`Raw Preview: ${rawText.substring(0, 397)}...`);
            console.log(`Summary Preview: ${summaryText.substring(0, 597)}...`);
            console.log(`----------------------------------------\n`);

            if (summaryText) {
              return summaryText.length > 600 ? summaryText.substring(0, 597) + '...' : summaryText;
            }
            return rawText.length > 400 ? rawText.substring(0, 397) + '...' : rawText;
          });
          if (retrievedFacts.length > 0) {
            facts = [...retrievedFacts, ...facts];
            emit('Memory Search', `Found ${topHits.length} relevant memories (truncated for context).`);
          }
        } catch (e) {
          console.error('[MemTrace Queue] MemTrace search failed:', e);
        }
      }
      payload.facts = facts;
      
      const { simulateMemTraceMesh } = await import('../simulith/src/engine/memtrace_engine.js');
      const result = await simulateMemTraceMesh({ ...payload, orchestrator: orchestratorConfig.orchestrator, isCancelled: () => job.status === 'cancelled' }, emit);

      if (payload.uuid && orchestratorConfig.orchestrator) {
        const outcomeText = `MemTrace Simulation Outcome:
Question: ${result.scenario.question}
Domain: ${result.domain}
Rounds: ${result.rounds}
Summary: ${result.report ? result.report.summary : 'Simulation completed successfully.'}`;
        
        orchestratorConfig.orchestrator.ingest(outcomeText, `memtrace:memtrace:run:${result.id}`, payload.uuid)
          .then(() => console.log(`[MemTrace Router] Ingested outcome for run ${result.id} into MemTrace.`))
          .catch(e => console.error(`[MemTrace Router] Failed to ingest outcome for run ${result.id} into MemTrace:`, e));
      }
      return result;
    } catch (err) {
      if (err.message !== 'Simulation Cancelled by user.') {
        console.error('\n================================================================');
        console.error('[MESH_FAILURE_CRITICAL] MemTrace Simulation Job failed execution!');
        console.error(`Job ID: ${job.id}`);
        console.error(`Error Type: ${err.name || 'Error'}`);
        console.error(`Error Message: ${err.message || String(err)}`);
        console.error('Stack Trace:');
        console.error(err.stack || 'No stack trace available.');
        console.error('================================================================\n');
      }
      throw err;
    } finally {
      job.llmCallCount = getLLMCallCount();
    }
  }
});

memtraceQueue.on('jobCompleted', async (jobId) => {
  const job = memtraceQueue.get(jobId);
  if (job && job.result && job.result.id && job.payload.uuid) {
    try {
      const durationSec = Math.round((Date.now() - new Date(job.createdAt).getTime()) / 1000);
      const tokens = job.tokensUsed || 0;
      const { updateSimulithUsage } = await import('../simulith/src/db/agent_memory.js');
      await updateSimulithUsage(job.result.id, job.payload.uuid, tokens, durationSec);
    } catch(e) {
      console.error('[Billing] Failed to save memtrace token usage:', e);
    }
  }
});

// POST /api/v4/simulate/memtrace
router.post('/simulate/memtrace', authenticate, async (req, res) => {
  try {
    const { question, facts, sources, maxRounds } = req.body;
    const uuid = req.user.uuid;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Guardrail Check
    const combinedInput = `${question} ${facts || ''}`;
    const isSafe = await checkInjectionGuardrail(combinedInput);
    if (!isSafe.safe) {
      return res.status(403).json({ error: isSafe.reason || 'Input blocked by security guardrails.' });
    }

    const job = memtraceQueue.enqueue({ question, facts, sources, maxRounds, uuid });
    res.status(202).json({ jobId: job.id, status: job.status, pollUrl: `/api/v4/memtrace/jobs/${job.id}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET /api/v4/memtrace/jobs/:jobId
router.get('/memtrace/jobs/:jobId', authenticate, (req, res) => {
  const job = memtraceQueue.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.payload.uuid !== req.user.uuid) return res.status(403).json({ error: 'Access denied' });
  if (job.status === 'running') {
    job.llmCallCount = getLLMCallCount();
  }
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    logs: job.logs,
    result: job.result,
    error: job.error,
    llmCallCount: job.llmCallCount
  });
});

router.delete('/memtrace/jobs/:jobId', authenticate, (req, res) => {
  const job = memtraceQueue.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.payload.uuid !== req.user.uuid) return res.status(403).json({ error: 'Access denied' });
  const success = memtraceQueue.cancel(req.params.jobId);
  res.json({ success, status: job.status });
});

// GET /api/v4/memtrace/:simId
router.get('/memtrace/:simId', authenticate, async (req, res) => {
  try {
    // NOTE: getSimulation (not getSim) is the correct export name in agent_memory.js
    const { getSimulation, getSimAgents, getSimInteractions, getSimEdges } = await import('../simulith/src/db/agent_memory.js');
    const sim = await getSimulation(req.params.simId, req.user.uuid);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const [agents, interactions, edges] = await Promise.all([
      getSimAgents(req.params.simId),
      getSimInteractions(req.params.simId, 500),
      getSimEdges(req.params.simId)
    ]);

    res.json({
      simulation: sim,
      // agents from getSimAgents() are already hydrated (beliefs is a plain object, not a string)
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        platform: a.platform,
        backstory: a.backstory,
        beliefs: a.beliefs
      })),
      interactions,
      edges
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/memtrace/:simId/rounds
router.get('/memtrace/:simId/rounds', authenticate, async (req, res) => {
  try {
    const { getRoundSummaries } = await import('../simulith/src/db/agent_memory.js');
    const rounds = await getRoundSummaries(req.params.simId, req.user.uuid);
    res.json({ rounds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
