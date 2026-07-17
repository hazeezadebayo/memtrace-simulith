import express from 'express';
import { JobQueue } from '../simulith/src/utils/queue.js';
import { simulateMesh } from '../simulith/src/engine/simulator.js';
import { authenticate, enforceOrigin } from './auth_server.js';
import { getUser } from './db_users.js';
import { getLLMCallCount, resetLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';
import { safeNumber, orchestratorConfig } from './simulith_server.js';
import { DEFAULT_CONFIG } from '../extension/env/config.js';
import { logAutomation } from '../simulith/src/automation/utils.js';

const router = express.Router();
router.use(enforceOrigin);

// POST /api/v4/simulate/mesh — Launch a full mesh simulation
router.post('/simulate/mesh', authenticate, async (req, res) => {
  try {
    const payload = { ...req.body, uuid: req.user?.uuid };
    
    // Token Forecasting
    const user = await getUser(req.user.uuid);
    const agentCount = safeNumber(payload.agentCount, 5, DEFAULT_CONFIG.LIMITS.mesh.minAgents, DEFAULT_CONFIG.LIMITS.mesh.maxAgents);
    const tickCount = safeNumber(payload.tickCount, 3, DEFAULT_CONFIG.LIMITS.mesh.minTicks, DEFAULT_CONFIG.LIMITS.mesh.maxTicks);
    const forecasted = (agentCount * tickCount * 2) + 5;

    if (!user || user.tokens < forecasted) {
      return res.status(402).json({ error: `Insufficient tokens. Forecasted requirement is ${forecasted} tokens, but you only have ${user?.tokens || 0}.` });
    }

    // Guardrail Check
    const combinedInput = `${payload.question || ''} ${payload.facts || ''} ${payload.domain || ''}`;
    const isSafe = await checkInjectionGuardrail(combinedInput);
    if (!isSafe.safe) {
      return res.status(403).json({ error: isSafe.reason || 'Input blocked by security guardrails.' });
    }

    // Run synchronously but stream progress via job queue
    const meshQueue = new JobQueue({
      retries: 1,
      backoffMs: 500,
      processJob: async (p, emit, job) => {
        resetLLMCallCount();
        // Bridge: forward every emit into globalAutomationLogs so the telemetry
        // poller (/api/v4/automation/status) can deliver nodes, round durations,
        // etc. to the client — the original emit only writes to job.logs.
        const bridgedEmit = (stage, message, details = {}) => {
          emit(stage, message, details);
          logAutomation(payload.uuid, stage, message, details);
        };
        try {
          const { loadState } = await import('../simulith/src/utils/council_utils.js');
          const state = await loadState(payload.uuid);
          return await simulateMesh({ ...p, customPersonas: state.customPersonas || [], isCancelled: () => job.status === 'cancelled' }, bridgedEmit);
        } catch (err) {
          if (err.message !== 'Simulation Cancelled by user.') {
            console.error('\n================================================================');
            console.error('[MESH_FAILURE_CRITICAL] Mesh Simulation Job failed execution!');
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
    const job = meshQueue.enqueue(payload);
    
    const purgeMeshQueue = async (jobId) => {
      const finishedJob = meshQueue.get(jobId);
      if (finishedJob && finishedJob.result && finishedJob.result.id && payload.uuid) {
         try {
           const durationSec = Math.round((Date.now() - new Date(finishedJob.createdAt).getTime()) / 1000);
           const tokens = finishedJob.tokensUsed || 0;
           const { updateSimulationUsage } = await import('../simulith/src/db/agent_memory.js');
           await updateSimulationUsage(finishedJob.result.id, payload.uuid, tokens, durationSec);

           const { loadState, saveState } = await import('../simulith/src/utils/council_utils.js');
           const state = await loadState(payload.uuid);
           const newRun = {
             id: finishedJob.result.id,
             createdAt: new Date().toISOString(),
             scenario: payload,
             type: 'mesh',
             status: 'completed',
             recommendation: finishedJob.result.recommendation
           };
           state.runs = [newRun, ...(state.runs || [])].slice(0, 50);
           await saveState(payload.uuid, state);

           if (orchestratorConfig.orchestrator) {
             const outcomeText = `Mesh Intelligence Simulation Outcome:
Question: ${payload.question}
Agents Engaged: ${finishedJob.result.agents?.length || agentCount}
Rounds Completed: ${finishedJob.result.roundSummaries?.length || tickCount}
Summary: ${finishedJob.result.report ? finishedJob.result.report.summary : 'Mesh simulation completed.'}`;
             
             orchestratorConfig.orchestrator.ingest(outcomeText, `memtrace:mesh:sim:${finishedJob.result.id}`, payload.uuid)
               .then(() => console.log(`[Mesh Router] Ingested outcome for sim ${finishedJob.result.id} into MemTrace.`))
               .catch(e => console.error(`[Mesh Router] Failed to ingest outcome:`, e));
           }
         } catch(e) {
           console.error('[Billing] Failed to save mesh token usage:', e);
         }
      }

      setTimeout(() => {
        if (router._meshQueues) router._meshQueues.delete(jobId);
      }, 5 * 60 * 1000);
    };
    meshQueue.once('jobCompleted', purgeMeshQueue);
    meshQueue.once('jobFailed', purgeMeshQueue);

    res.status(202).json({ jobId: job.id, status: job.status, pollUrl: `/api/v4/jobs-mesh/${job.id}`, _queue: meshQueue });
    // Expose queue so we can poll it — attach to the router-level map
    if (!router._meshQueues) router._meshQueues = new Map();
    router._meshQueues.set(job.id, { queue: meshQueue, jobId: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Mesh simulation failed' });
  }
});

// GET /api/v4/jobs-mesh/:id — Poll a mesh job
router.get('/jobs-mesh/:id', authenticate, (req, res) => {
  const entry = router._meshQueues?.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Mesh job not found' });
  const job = entry.queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found in queue' });
  if (job.payload.uuid !== req.user.uuid) return res.status(403).json({ error: 'Access denied' });
  if (job.status === 'running') {
    job.llmCallCount = getLLMCallCount();
  }
  res.json(job);
});

router.delete('/jobs-mesh/:id', authenticate, (req, res) => {
  const entry = router._meshQueues?.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Mesh job not found' });
  const job = entry.queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found in queue' });
  if (job.payload.uuid !== req.user.uuid) return res.status(403).json({ error: 'Access denied' });
  const success = entry.queue.cancel(req.params.id);
  res.json({ success, status: job.status });
});

// GET /api/v4/mesh/:simId — Full simulation result
router.get('/mesh/:simId', authenticate, async (req, res) => {
  try {
    const { getSimulation, getSimAgents, getSimInteractions, getSimEdges } = await import('../simulith/src/db/agent_memory.js');
    const sim = await getSimulation(req.params.simId, req.user.uuid);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });
    
    const [agents, interactions, edges] = await Promise.all([
      getSimAgents(req.params.simId),
      getSimInteractions(req.params.simId, 500),
      getSimEdges(req.params.simId),
    ]);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });
    res.json({ sim, agents, interactions, graph: { nodes: agents, edges } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/v4/mesh/:simId/agents — All agents with beliefs
router.get('/mesh/:simId/agents', authenticate, async (req, res) => {
  try {
    const { getSimulation, getSimAgents } = await import('../simulith/src/db/agent_memory.js');
    const sim = await getSimulation(req.params.simId, req.user.uuid);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });
    res.json(await getSimAgents(req.params.simId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/v4/mesh/:simId/agent/:agentId — Single agent + feed
router.get('/mesh/:simId/agent/:agentId', authenticate, async (req, res) => {
  try {
    const { getSimulation, loadAgent, getAgentFeed } = await import('../simulith/src/db/agent_memory.js');
    const sim = await getSimulation(req.params.simId, req.user.uuid);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const [agent, feed] = await Promise.all([
      loadAgent(req.params.agentId),
      getAgentFeed(req.params.agentId, req.params.simId),
    ]);
    if (!agent || agent.simId !== req.params.simId) return res.status(404).json({ error: 'Agent not found' });
    res.json({ agent, feed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/v4/mesh/:simId/agent/:agentId/chat — Chat with a specific agent
router.post('/mesh/:simId/agent/:agentId/chat', authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });


    const { getSimulation, loadAgent, getAgentFeed } = await import('../simulith/src/db/agent_memory.js');
    const { generateAgentChatReply } = await import('../simulith/src/agents/interview.js');

    const sim = await getSimulation(req.params.simId, req.user.uuid);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const [agent, feed] = await Promise.all([
      loadAgent(req.params.agentId),
      getAgentFeed(req.params.agentId, req.params.simId, 20),
    ]);
    if (!agent || agent.simId !== req.params.simId) return res.status(404).json({ error: 'Agent not found' });

    const scenarioQuestion = sim.scenario?.question || '';
    const scenarioFacts = (sim.scenario?.facts || []).map(f => `- ${f}`).join('\n') || 'None';

    const reply = await generateAgentChatReply(agent, feed, scenarioQuestion, scenarioFacts, message);
    res.json({ agentId: agent.id, name: agent.name, platform: agent.platform, reply });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/v4/mesh/:simId/interactions — Interaction feed
router.get('/mesh/:simId/interactions', authenticate, async (req, res) => {
  try {
    const { getSimulation, getSimInteractions } = await import('../simulith/src/db/agent_memory.js');
    const sim = await getSimulation(req.params.simId, req.user.uuid);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const limit = Math.min(500, Number(req.query.limit) || 200);
    res.json(await getSimInteractions(req.params.simId, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/v4/mesh/:simId/graph — Graph nodes + edges
router.get('/mesh/:simId/graph', authenticate, async (req, res) => {
  try {
    const { getSimulation, getSimAgents, getSimEdges } = await import('../simulith/src/db/agent_memory.js');
    const sim = await getSimulation(req.params.simId, req.user.uuid);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const [agents, edges] = await Promise.all([
      getSimAgents(req.params.simId),
      getSimEdges(req.params.simId),
    ]);
    res.json({ nodes: agents.map(a => ({ id: a.id, name: a.name, platform: a.platform, cluster: a.cluster, beliefs: a.beliefs })), edges });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
