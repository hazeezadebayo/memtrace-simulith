import express from 'express';
import { authenticate, enforceOrigin } from './auth_server.js';
import { getUser } from './db_users.js';
import { checkInjectionGuardrail } from '../extension/core/llm_agent.js';
import { safeNumber } from './simulith_server.js';
import { DEFAULT_CONFIG } from '../extension/env/config.js';

const router = express.Router();
router.use(enforceOrigin);

const activeTreeProgress = new Map();
const activeTreeJobs = new Map();

// ===== TREE MODE (CONSEQUENCE ENGINE) ROUTES =====

router.get('/simulate/tree/status', authenticate, (req, res) => {
  const progress = activeTreeProgress.get(req.user.uuid) || { llmCallCount: 0, nodesComputed: 0 };
  res.json(progress);
});

router.delete('/simulate/tree/cancel', authenticate, (req, res) => {
  const controller = activeTreeJobs.get(req.user.uuid);
  if (controller) {
    console.log(`[TreeRouter] Explicitly cancelling tree builder for user ${req.user.uuid}...`);
    controller.abort();
    activeTreeJobs.delete(req.user.uuid);
    return res.json({ ok: true, cancelled: true });
  }
  res.json({ ok: true, cancelled: false, reason: 'No active tree job found.' });
});

router.post('/simulate/tree', authenticate, async (req, res) => {
  try {
    const startTime = Date.now();
    const payload = { ...req.body, uuid: req.user?.uuid };

    if (!payload.decision) {
      return res.status(400).json({ error: 'Decision seed is required for Tree Mode.' });
    }

    const depth           = safeNumber(payload.depth, 3, DEFAULT_CONFIG.LIMITS.tree.minDepth, DEFAULT_CONFIG.LIMITS.tree.maxDepth);
    const branchingFactor = safeNumber(payload.branchingFactor, 3, DEFAULT_CONFIG.LIMITS.tree.minBranchingFactor, DEFAULT_CONFIG.LIMITS.tree.maxBranchingFactor);
    const contextStr      = payload.context || 'General constraints';

    // Token Forecasting
    let forecasted = 5; // +2 for the adapter LLM calls
    for (let k = 0; k < depth; k++) {
      forecasted += Math.pow(branchingFactor, k) + 2 * Math.pow(branchingFactor, k + 1);
    }

    const user = await getUser(req.user.uuid);
    if (!user || user.tokens < forecasted) {
      return res.status(402).json({ error: `Insufficient tokens. Forecasted requirement is ${forecasted} tokens, but you only have ${user?.tokens || 0}.` });
    }

    const isSafe = await checkInjectionGuardrail(payload.decision);
    if (!isSafe.safe) {
      return res.status(403).json({ error: isSafe.reason || 'Input blocked by security guardrails.' });
    }

    const { buildTree } = await import('../simulith/src/tree/tree_builder.js');
    const { generateDecisionSpace, extractDominantPaths, explainDominantFutures } = await import('../simulith/src/tree/query_adapter.js');

    const abortController = new AbortController();
    activeTreeJobs.set(req.user.uuid, abortController);

    req.on('close', () => {
      console.log(`[TreeRouter] Client request closed for user ${req.user.uuid}. Aborting tree builder...`);
      abortController.abort();
      activeTreeProgress.delete(req.user.uuid);
      activeTreeJobs.delete(req.user.uuid);
    });

    const { getLLMCallCount, resetLLMCallCount } = await import('../extension/core/llm_agent.js');
    resetLLMCallCount();

    // Set initial progress
    activeTreeProgress.set(payload.uuid, { llmCallCount: getLLMCallCount(), nodesComputed: 1 });

    const storeContext = {
      uuid: payload.uuid,
      onTokenUsed: () => {
        const current = activeTreeProgress.get(payload.uuid) || { llmCallCount: 0, nodesComputed: 1 };
        activeTreeProgress.set(payload.uuid, { ...current, llmCallCount: getLLMCallCount() });
      },
      signal: abortController.signal
    };

    let result;
    if (global.memtraceLlmContext && payload.uuid) {
      result = await new Promise((resolve, reject) => {
        global.memtraceLlmContext.run(storeContext, async () => {
          try {
            const { determineDomainAndAudience } = await import('../simulith/src/agents/generative.js');
            const classification = await determineDomainAndAudience(payload.decision, [contextStr]);

            const { normalizeToBranchDomain } = await import('../simulith/src/graph/domain_matcher.js');
            const domainName = await normalizeToBranchDomain(classification.domain) || 'COMMON';

            const { getDomainOntology } = await import('../simulith/src/data/ontology.js');

            // ── Phase 1: Adapt the base ontology to the specific query ──────
            console.log('[TreeRouter] Phase 1: Generating query-specific decision space...');
            const baseOntology   = getDomainOntology(domainName);
            const decisionSpace  = await generateDecisionSpace(payload.decision, contextStr, baseOntology);
            console.log(`[TreeRouter] Decision space ready. Variables: ${Object.keys(decisionSpace.variables || {}).length}, Operators: ${Object.keys(decisionSpace.operators || {}).length}`);

            // ── Phase 2: Build the tree with the query-specific ontology ────
            console.log('[TreeRouter] Phase 2: Building consequence tree...');
            const treeRes = await buildTree(payload.decision, contextStr, domainName, depth, branchingFactor, (prog) => {
              activeTreeProgress.set(payload.uuid, prog);
            }, decisionSpace);

            // ── Phase 3: Extract and explain dominant futures ────────────────
            console.log('[TreeRouter] Phase 3: Extracting dominant paths and generating narratives...');
            const dominantPaths    = extractDominantPaths(treeRes.tree, treeRes.root_state?.id, 3);
            const dominantFutures  = await explainDominantFutures(payload.decision, dominantPaths, decisionSpace);
            console.log(`[TreeRouter] ${dominantFutures.length} dominant futures explained.`);

            treeRes.decisionSpace   = {
              decision_summary:   decisionSpace.decision_summary || '',
              variable_labels:    decisionSpace.variable_labels   || {},
              operator_labels:    decisionSpace.operator_labels    || {},
              stakeholder_labels: decisionSpace.stakeholder_labels || {},
            };
            treeRes.dominantFutures = dominantFutures;
            resolve(treeRes);
          } catch (err) {
            reject(err);
          }
        });
      });
    } else {
      const { determineDomainAndAudience } = await import('../simulith/src/agents/generative.js');
      const classification = await determineDomainAndAudience(payload.decision, [contextStr]);

      const { normalizeToBranchDomain } = await import('../simulith/src/graph/domain_matcher.js');
      const domainName = await normalizeToBranchDomain(classification.domain) || 'COMMON';

      const { getDomainOntology } = await import('../simulith/src/data/ontology.js');

      console.log('[TreeRouter] Phase 1: Generating query-specific decision space...');
      const baseOntology   = getDomainOntology(domainName);
      const decisionSpace  = await generateDecisionSpace(payload.decision, contextStr, baseOntology);

      console.log('[TreeRouter] Phase 2: Building consequence tree...');
      result = await buildTree(payload.decision, contextStr, domainName, depth, branchingFactor, (prog) => {
        activeTreeProgress.set(payload.uuid, prog);
      }, decisionSpace);

      console.log('[TreeRouter] Phase 3: Extracting dominant paths and generating narratives...');
      const dominantPaths    = extractDominantPaths(result.tree, result.root_state?.id, 3);
      const dominantFutures  = await explainDominantFutures(payload.decision, dominantPaths, decisionSpace);

      result.decisionSpace   = {
        decision_summary:   decisionSpace.decision_summary || '',
        variable_labels:    decisionSpace.variable_labels   || {},
        operator_labels:    decisionSpace.operator_labels    || {},
        stakeholder_labels: decisionSpace.stakeholder_labels || {},
      };
      result.dominantFutures = dominantFutures;
    }

    // Keep telemetry progress data in memory briefly to prevent in-flight race conditions, then clean up
    setTimeout(() => {
      activeTreeProgress.delete(payload.uuid);
    }, 300000);

    result.llmCallCount = getLLMCallCount();
    
    // Save to database
    try {
      const durationSec = Math.round((Date.now() - startTime) / 1000);
      const { randomUUID } = await import('node:crypto');
      const { saveTreeSimulation } = await import('../simulith/src/db/agent_memory.js');
      await saveTreeSimulation({
        id: randomUUID(),
        uuid: payload.uuid,
        scenario: { question: payload.decision },
        report: result,
        tokensUsed: result.llmCallCount,
        durationSec: durationSec
      });
    } catch (dbErr) {
      console.error('[TreeRouter] Failed to save tree simulation:', dbErr);
    }

    res.json(result);
  } catch (err) {
    if (req.user?.uuid) {
      activeTreeProgress.delete(req.user.uuid);
    }
    if (err.name === 'AbortError' || err.message === 'Simulation Cancelled by user.') {
      console.log(`[TreeRouter] Tree builder successfully aborted/cancelled for user ${req.user?.uuid}`);
      return;
    }
    console.error('🚨 TREE MODE FAILURE:', err);
    res.status(500).json({ error: err.message || 'Tree simulation failed' });
  } finally {
    if (req.user?.uuid) {
      activeTreeJobs.delete(req.user.uuid);
    }
  }
});

export default router;
