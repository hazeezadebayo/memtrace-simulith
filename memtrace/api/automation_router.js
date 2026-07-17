import express from 'express';
import { authenticate, enforceOrigin } from './auth_server.js';
import { getUser } from './db_users.js';
import { checkInjectionGuardrail, getLLMCallCount } from '../extension/core/llm_agent.js';
import { routeQuery, runDivergenceAnalysis } from '../simulith/src/automation/index.js';
import { getAutomationState, getAutomationLogs, logAutomation, isCancellationError } from '../simulith/src/automation/utils.js';

const router = express.Router();
router.use(enforceOrigin);

// Registry of in-flight abort controllers keyed by user uuid.
// Allows explicit server-side cancellation independent of TCP connection state.
const activeRouterJobs = new Map();

function getBaseUrl(req) {
  const port = process.env.PORT || 3106;
  return `http://127.0.0.1:${port}`;
}

function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.cookies?.auth_token || '';
}

async function enrichPayload(uuid, payload) {
  const logs = [];
  try {
    const { enrichScenarioWithTools } = await import('../simulith/src/tools/ToolDecider.js');
    logs.push({ stage: 'enrichment', message: 'Analyzing query for relevant data sources...' });
    const enrichment = await enrichScenarioWithTools({
      question: payload.question,
      facts: payload.facts
    });
    if (enrichment?.facts?.length) {
      payload._enriched = enrichment.tool;
      payload._enrichedQuery = enrichment.query;
      payload.facts = [...enrichment.facts, ...(payload.facts || [])];
      logs.push({ stage: 'enrichment', message: `Tool selected: ${enrichment.tool.toUpperCase()}` });
      logs.push({ stage: 'enrichment', message: `Generated query: "${enrichment.query}"` });
      logs.push({ stage: 'enrichment', message: `Retrieved ${enrichment.facts.length} fact(s).` });
      for (const fact of enrichment.facts) {
        logs.push({ stage: 'enrichment', message: `[DATA] ${fact.slice(0, 200)}${fact.length > 200 ? '...' : ''}` });
      }
    } else {
      logs.push({ stage: 'enrichment', message: 'No relevant data sources found — proceeding with existing context.' });
    }
  } catch (err) {
    logs.push({ stage: 'enrichment', message: `Tool enrichment failed: ${err.message}` });
    console.warn('[Enrichment] Non-fatal:', err.message);
  }
  for (const l of logs) {
    logAutomation(uuid, l.stage, l.message);
  }
  payload._enrichmentLogs = (payload._enrichmentLogs || []).concat(logs);
}

// GET /api/v4/automation/status (Telemetry Polling)
router.get('/status', authenticate, (req, res) => {
  res.json({
    llmCallCount: getLLMCallCount(),
    automationState: getAutomationState(req.user.uuid) || 'STANDBY',
    logs: getAutomationLogs(req.user.uuid)
  });
});

// POST /api/v4/automation/router (Router Mode)
router.post('/router', authenticate, async (req, res) => {
  try {
    const payload = { ...req.body, uuid: req.user.uuid };
    const query = payload.question || payload.decision || '';

    if (!query) {
      return res.status(400).json({ error: 'Question or decision query is required.' });
    }

    // Token Check (require at least 50 tokens as a baseline for routing + simulation)
    const user = await getUser(req.user.uuid);
    if (!user || user.tokens < 50) {
      return res.status(402).json({ error: `Insufficient tokens for Router Mode.` });
    }

    // Guardrail Check
    const combinedInput = `${query} ${payload.facts || ''} ${payload.domain || ''}`;
    const isSafe = await checkInjectionGuardrail(combinedInput);
    if (!isSafe.safe) {
      return res.status(403).json({ error: isSafe.reason || 'Input blocked by security guardrails.' });
    }

    await enrichPayload(req.user.uuid, payload);

    const token = extractToken(req);
    const baseUrl = getBaseUrl(req);

    // Abort when the client disconnects (user clicked Cancel)
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());
    activeRouterJobs.set(req.user.uuid, abortController);

    // Start keep-alive stream to prevent browser/proxy idle timeouts during long LLM tasks
    res.setHeader('Content-Type', 'application/json');
    const keepAliveInterval = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 30000);

    try {
      // Re-enter ALS context with signal so every nested callLLM call aborts on client disconnect
      const result = await new Promise((resolve, reject) => {
        global.memtraceLlmContext.run({ uuid: req.user.uuid, onTokenUsed: null, signal: abortController.signal }, async () => {
          try { resolve(await routeQuery(baseUrl, token, payload, abortController.signal)); }
          catch (err) { reject(err); }
        });
      });

      clearInterval(keepAliveInterval);
      if (!res.writableEnded) { res.write(JSON.stringify(result)); res.end(); }
    } catch (err) {
      clearInterval(keepAliveInterval);
      if (isCancellationError(err, abortController.signal)) {
        if (!res.writableEnded) res.end();
        return;
      }
      console.error('[Automation Router API Error]:', err);
      if (!res.writableEnded) {
        res.write(JSON.stringify({ error: err.message || 'Router execution failed' }));
        res.end();
      }
    } finally {
      activeRouterJobs.delete(req.user.uuid);
    }
  } catch (err) {
    console.error('[Automation Router API Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Router execution failed' });
    }
  }
});

// DELETE /api/v4/automation/router/cancel — Explicit server-side cancellation for router mode
router.delete('/router/cancel', authenticate, (req, res) => {
  const controller = activeRouterJobs.get(req.user.uuid);
  if (controller) {
    controller.abort();
    activeRouterJobs.delete(req.user.uuid);
    return res.json({ ok: true, cancelled: true });
  }
  res.json({ ok: true, cancelled: false, reason: 'No active router job found.' });
});

// POST /api/v4/automation/divergence (Reality Divergence Engine)
router.post('/divergence', authenticate, async (req, res) => {
  try {
    const payload = { ...req.body, uuid: req.user.uuid };
    const query = payload.question || payload.decision || '';
    const runSequentially = req.body.runSequentially !== undefined ? req.body.runSequentially : true;

    if (!query) {
      return res.status(400).json({ error: 'Question or decision query is required.' });
    }

    // Token Check (divergence runs all 3, need a higher baseline)
    const user = await getUser(req.user.uuid);
    if (!user || user.tokens < 150) {
      return res.status(402).json({ error: `Insufficient tokens for Divergence Engine.` });
    }

    // Guardrail Check
    const combinedInput = `${query} ${payload.facts || ''} ${payload.domain || ''}`;
    const isSafe = await checkInjectionGuardrail(combinedInput);
    if (!isSafe.safe) {
      return res.status(403).json({ error: isSafe.reason || 'Input blocked by security guardrails.' });
    }

    await enrichPayload(req.user.uuid, payload);

    const token = extractToken(req);
    const baseUrl = getBaseUrl(req);

    // Abort when the client disconnects (user clicked Cancel)
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());
    activeRouterJobs.set(`divergence:${req.user.uuid}`, abortController);

    // Start keep-alive stream to prevent browser/proxy idle timeouts
    res.setHeader('Content-Type', 'application/json');
    const keepAliveInterval = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 30000);

    try {
      // Re-enter ALS context with signal so every nested callLLM call aborts on client disconnect
      const result = await new Promise((resolve, reject) => {
        global.memtraceLlmContext.run({ uuid: req.user.uuid, onTokenUsed: null, signal: abortController.signal }, async () => {
          try { resolve(await runDivergenceAnalysis(baseUrl, token, payload, runSequentially, abortController.signal)); }
          catch (err) { reject(err); }
        });
      });

      clearInterval(keepAliveInterval);
      if (!res.writableEnded) { res.write(JSON.stringify(result)); res.end(); }
    } catch (err) {
      clearInterval(keepAliveInterval);
      if (isCancellationError(err, abortController.signal)) {
        if (!res.writableEnded) res.end();
        return;
      }
      console.error('[Divergence Engine API Error]:', err);
      if (!res.writableEnded) {
        res.write(JSON.stringify({ error: err.message || 'Divergence execution failed' }));
        res.end();
      }
    } finally {
      activeRouterJobs.delete(`divergence:${req.user.uuid}`);
    }
  } catch (err) {
    console.error('[Divergence Engine API Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Divergence execution failed' });
    }
  }
});

// DELETE /api/v4/automation/divergence/cancel — Explicit server-side cancellation for divergence mode
router.delete('/divergence/cancel', authenticate, (req, res) => {
  const controller = activeRouterJobs.get(`divergence:${req.user.uuid}`);
  if (controller) {
    controller.abort();
    activeRouterJobs.delete(`divergence:${req.user.uuid}`);
    return res.json({ ok: true, cancelled: true });
  }
  res.json({ ok: true, cancelled: false, reason: 'No active divergence job found.' });
});

export default router;
