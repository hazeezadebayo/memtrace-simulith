import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobQueue } from '../simulith/src/utils/queue.js';
import { simulateScenario } from '../simulith/src/engine/simulator.js';
import { loadState, saveState, recordOutcome } from '../simulith/src/utils/council_utils.js';
import { authenticate, enforceOrigin } from './auth_server.js';
import { getUser } from './db_users.js';
import { getLLMCallCount, resetLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';
import { DEFAULT_CONFIG } from '../extension/env/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
router.use(enforceOrigin);

export const orchestratorConfig = { orchestrator: null };
export function injectOrchestrator(orch) {
  orchestratorConfig.orchestrator = orch;
}

export const COUNCIL_ROOT = path.join(__dirname, '..', 'simulith');
export const queue = new JobQueue({
  retries: 3,
  backoffMs: 500,
  processJob: async (payload, emit, job) => {
    resetLLMCallCount();
    try {
      let facts = payload.facts || [];
      
      if (payload.uuid && orchestratorConfig.orchestrator) {
        emit('Memory Search', 'Retrieving context from MemTrace base...');
        try {
          const hits = await orchestratorConfig.orchestrator.search(payload.uuid, payload.question);
          const topHits = hits.slice(0, 2);
          // Map the results to strings. We prefer summary, fallback to truncated text.
          const retrievedFacts = topHits.map((hit, index) => {
            const rawText = hit.chunk.chunk || hit.chunk.text || '';
            const summaryText = hit.chunk.summary || '';
            
            console.log(`\n--- [RAG FETCH: COUNCIL (Hit ${index + 1})] ---`);
            console.log(`Raw Length: ${rawText.length} chars | Summary Length: ${summaryText.length} chars`);
            console.log(`Raw Preview: ${rawText.substring(0, 397)}.`);
            console.log(`Summary Preview: ${summaryText.substring(0, 597)}.`);
            console.log(`-------------------------------------\n`);

            if (summaryText) {
              return summaryText.length > 600 ? summaryText.substring(0, 597) + '...' : summaryText;
            }
            return rawText.length > 400 ? rawText.substring(0, 397) + '...' : rawText;
          });
          if (retrievedFacts.length > 0) {
            facts = [...retrievedFacts, ...facts];
            emit('Memory Search', `Found ${topHits.length} relevant memories (truncated for context).`);
          } else {
            emit('Memory Search', 'No highly relevant memories found.');
          }
        } catch (e) {
          console.error('MemTrace search failed:', e);
          emit('Memory Search', 'Failed to retrieve memories. Proceeding with manual facts.');
        }
      }
      
      payload.facts = facts;
      const state = await loadState(payload.uuid);
      const normReq = normalizeRequest(payload, state);
      normReq.isCancelled = () => job.status === 'cancelled';
      const result = await simulateScenario(normReq, state, emit);
      state.personas = result.population.personas.map(({ reactions, ...persona }) => persona);
      if (!state.runs) state.runs = [];
      state.runs.unshift({
        id: result.id,
        scenario: result.scenario,
        recommendation: result.recommendation,
        branches: result.branches.map(branch => ({
          id: branch.id,
          title: branch.title,
          score: branch.score,
          rank: branch.rank,
          confidence: branch.confidence
        })),
        timeline: result.timeline,
        evidence: result.evidence.summary,
        population: result.population,
        createdAt: new Date().toISOString()
      });
      state.runs = state.runs.slice(0, 50);
      await saveState(payload.uuid, state);
      
      // Save Council Round Summary to SQLite for History Profile
      try {
        const { saveRoundSummary, updateSimulithUsage } = await import('../simulith/src/db/agent_memory.js');
        const durationSec = Math.round((Date.now() - new Date(job.createdAt).getTime()) / 1000);
        const tokens = job.tokensUsed || 0;
        
        // Pass result.population.personas into the snapshot so View Report can parse agent count
        await saveRoundSummary(
          result.id, // simId
          1,         // round / tick_count
          JSON.stringify({
            reason: result.recommendation.reason,
            vulnerability: result.recommendation.whatWouldChangeMyMind,
            query: payload.question || 'Council Simulation'
          }),        // global_summary
          null,      // shock_event
          { nodes: result.population.personas }, // graph_snapshot
          payload.uuid
        );
        
        await updateSimulithUsage(result.id, payload.uuid, tokens, durationSec);
      } catch (dbErr) {
        console.error('[Council Router] Failed to save council round to DB:', dbErr);
      }
      
      // Ingest the simulation outcome into the memory substrate asynchronously
      if (payload.uuid && orchestratorConfig.orchestrator) {
        const outcomeText = `Simulation Outcome:
Question: ${result.scenario.question}
Domain: ${result.scenario.domain}
Audience: ${result.scenario.audience}
Recommended Action: ${result.recommendation.title}
Strategic Directive: ${result.recommendation.reason}
Councilal Vulnerability: ${result.recommendation.whatWouldChangeMyMind}`;
        
        // Do not await to avoid delaying the job completion
        orchestratorConfig.orchestrator.ingest(outcomeText, `memtrace:council:run:${result.id}`, payload.uuid)
          .then(() => console.log(`[Council Router] Successfully ingested outcome for run ${result.id} into MemTrace.`))
          .catch(e => console.error(`[Council Router] Failed to ingest outcome for run ${result.id} into MemTrace:`, e));
      }
      
      return result;
    } catch (err) {
      if (err.message !== 'Simulation Cancelled by user.') {
        console.error('\n================================================================');
        console.error('[COUNCIL_FAILURE_CRITICAL] Council Simulation Job failed execution!');
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

// Global job queue is ephemeral in SQLite model
queue.load([]);
function safeNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeRequest(body, state) {
  return {
    uuid: body.uuid ?? null,
    question: body.question ?? body.prompt ?? '',
    facts: body.facts ?? [],
    sources: body.sources ?? body.evidence ?? [],
    customPersonas: body.customPersonas ?? [],
    domain: body.domain ?? 'general',
    audience: body.audience ?? 'general',
    branchCount: safeNumber(body.branchCount ?? state.settings?.branchCount, 4, DEFAULT_CONFIG.LIMITS.council.minBranches, DEFAULT_CONFIG.LIMITS.council.maxBranches),
    personaCount: safeNumber(body.personaCount ?? state.settings?.personaCount, 4, DEFAULT_CONFIG.LIMITS.council.minPersonas, DEFAULT_CONFIG.LIMITS.council.maxPersonas),
    weights: body.weights ?? state.settings?.weights ?? {},
    personaTweaks: Array.isArray(body.personaTweaks) ? body.personaTweaks : []
  };
}
export { safeNumber };

router.get('/health', (req, res) => {
  res.json({ ok: true });
});

router.get('/state', authenticate, async (req, res) => {
  const state = await loadState(req.user.uuid);
  res.json({
    settings: state.settings,
    personas: state.personas,
    outcomeStats: state.outcomeStats,
    clusterVersion: state.clusterVersion
  });
});

router.get('/runs', authenticate, async (req, res) => {
  const state = await loadState(req.user.uuid);
  res.json({ runs: state.runs || [] });
});

router.post('/settings', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    const body = req.body;
    state.settings = {
      ...state.settings,
      branchCount: safeNumber(body.branchCount ?? state.settings?.branchCount, 4, DEFAULT_CONFIG.LIMITS.council.minBranches, DEFAULT_CONFIG.LIMITS.council.maxBranches),
      personaCount: safeNumber(body.personaCount ?? state.settings?.personaCount, 4, DEFAULT_CONFIG.LIMITS.council.minPersonas, DEFAULT_CONFIG.LIMITS.council.maxPersonas),
      contradictionSensitivity: safeNumber(body.contradictionSensitivity ?? state.settings?.contradictionSensitivity, 1, 0, 3),
      weights: {
        ...(state.settings?.weights || {}),
        ...(body.weights || {})
      }
    };
    await saveState(req.user.uuid, state);
    res.json({ settings: state.settings });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to update settings' });
  }
});

router.post('/recluster', authenticate, async (req, res) => {
  const state = await loadState(req.user.uuid);
  const { reclusterPersonas } = await import('../simulith/src/utils/council_utils.js');
  state.personas = reclusterPersonas(state.personas, state.outcomeStats);
  state.clusterVersion = (state.clusterVersion || 1) + 1;
  await saveState(req.user.uuid, state);
  res.json({ personas: state.personas, clusterVersion: state.clusterVersion });
});

router.post('/runs/:id/outcome', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    const runId = req.params.id;
    const run = (state.runs || []).find(item => item.id === runId);
    const updated = await recordOutcome(state, run, req.body);
    await saveState(req.user.uuid, updated);
    res.json({ ok: true, outcomeStats: updated.outcomeStats });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to record outcome' });
  }
});

export default router;
