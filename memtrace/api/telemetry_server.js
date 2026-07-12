import express from 'express';
import { authenticate } from './auth_server.js';

const router = express.Router();





// ===== BILLING & ADMIN ROUTES =====

const requireAdmin = (req, res, next) => {
  const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [];
  if (req.user && req.user.email && adminEmails.includes(req.user.email.toLowerCase())) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
};

// GET /api/v4/user/profile
router.get('/user/profile', authenticate, async (req, res) => {
  try {
    const { getUser, hasPendingTokenRequest } = await import('./db_users.js');
    let user = await getUser(req.user.uuid);

    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [];
    const isAdmin = user && user.email ? adminEmails.includes(user.email.toLowerCase()) : false;
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const hasPending = await hasPendingTokenRequest(req.user.uuid);

    res.json({ email: user.email, tokens: user.tokens, isAdmin, hasPendingRequest: hasPending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v4/user/buy-tokens
router.post('/user/buy-tokens', authenticate, async (req, res) => {
  try {
    const { packageType } = req.body;
    let amount = 0;
    
    if (packageType === 'basic') amount = 150;
    else if (packageType === 'pro') amount = 350;
    else if (packageType === 'enterprise') amount = 500;
    else return res.status(400).json({ error: 'Invalid package type' });

    const { createTokenRequest, hasPendingTokenRequest } = await import('./db_users.js');
    
    const hasPending = await hasPendingTokenRequest(req.user.uuid);
    if (hasPending) {
      return res.status(400).json({ error: 'You already have a pending token request. Please wait for admin approval.' });
    }

    const success = await createTokenRequest(req.user.uuid, amount);
    
    if (!success) {
      return res.status(400).json({ error: 'Failed to create token request' });
    }
    
    res.json({ success: true, pendingAmount: amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v4/user/simulations/:id
router.delete('/user/simulations/:id', authenticate, async (req, res) => {
  try {
    const { deleteSimulation } = await import('../simulith/src/db/agent_memory.js');
    const { type } = req.query; // 'mesh' or 'council'
    const simId = req.params.id;
    
    // 1. Delete from SQLite History Database
    const success = await deleteSimulation(simId, req.user.uuid, type);
    if (!success) {
      return res.status(404).json({ error: 'Simulation not found or unauthorized' });
    }
    
    // 2. Cascading Delete: Purge from State and Orchestrator Graph (Council only)
    if (type === 'council') {
      const { loadState, saveState } = await import('../simulith/src/utils/council_utils.js');
      const state = await loadState(req.user.uuid);
      
      const runIndex = (state.runs || []).findIndex(item => item.id === simId);
      if (runIndex >= 0) {
        const run = state.runs[runIndex];
        
        // Un-learn all ingested branches from the Orchestrator
        if (orchestrator && run.branches) {
          for (const branch of run.branches) {
            const urn = `memtrace:council:knowledge:${branch.id}`;
            try {
              await orchestrator.deleteRef(req.user.uuid, urn);
              console.log(`[Cascading Delete] Purged ingested branch: ${urn}`);
            } catch (err) {
              console.error(`[Cascading Delete] Failed to purge branch ${urn}:`, err);
            }
          }
        }
        
        // Remove from user state file
        state.runs.splice(runIndex, 1);
        await saveState(req.user.uuid, state);
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/user/simulations
router.get('/user/simulations', authenticate, async (req, res) => {
  try {
    const { getDb } = await import('../simulith/src/db/agent_memory.js');
    const db = await getDb();
    
    const meshRes = await db.execute({
      sql: `SELECT id, scenario, agent_count, tick_count, status, created_at, completed_at, tokens_used, duration_sec, report FROM mesh_simulations WHERE uuid = ?`,
      args: [req.user.uuid]
    });

    const councilRes = await db.execute({
      sql: `SELECT id, sim_id, round, global_summary, shock_event, graph_snapshot, created_at, tokens_used, duration_sec FROM memtrace_rounds WHERE uuid = ?`,
      args: [req.user.uuid]
    });

    const treeRes = await db.execute({
      sql: `SELECT id, scenario, status, created_at, tokens_used, duration_sec, report FROM tree_simulations WHERE uuid = ?`,
      args: [req.user.uuid]
    });

    const simulations = [];

    meshRes.rows.forEach(s => {
      let parsedReport = null;
      let parsedScenario = null;
      try { parsedReport = s.report ? JSON.parse(s.report) : null; } catch(e){}
      try { parsedScenario = s.scenario ? JSON.parse(s.scenario) : null; } catch(e){}
      simulations.push({
        id: s.id,
        type: 'mesh',
        tokens_used: s.tokens_used,
        duration_sec: s.duration_sec,
        agent_count: s.agent_count,
        tick_count: s.tick_count,
        created_at: s.created_at,
        councilal_hypothesis: parsedScenario?.question || 'N/A',
        summary: parsedReport?.summary || parsedReport?.recommendation?.title || 'No Summary',
        report: parsedReport
      });
    });

    councilRes.rows.forEach(p => {
      let parsedGraph = null;
      let parsedSummary = null;
      try { parsedGraph = p.graph_snapshot ? JSON.parse(p.graph_snapshot) : null; } catch(e){}
      try { parsedSummary = p.global_summary ? JSON.parse(p.global_summary) : null; } catch(e){}
      
      const isJson = parsedSummary && typeof parsedSummary === 'object';
      const actualSummary = isJson ? parsedSummary.reason : p.global_summary;
      const actualQuery = isJson && parsedSummary.query ? parsedSummary.query : ('Council Round ' + p.round);
      
      simulations.push({
        id: p.id,
        type: 'council',
        tokens_used: p.tokens_used,
        duration_sec: p.duration_sec,
        agent_count: parsedGraph?.nodes?.length || 0,
        tick_count: p.round,
        created_at: p.created_at,
        councilal_hypothesis: actualQuery,
        summary: actualSummary,
        global_summary: isJson ? parsedSummary : { reason: p.global_summary },
        graph_snapshot: parsedGraph
      });
    });

    treeRes.rows.forEach(t => {
      let parsedReport = null;
      let parsedScenario = null;
      try { parsedReport = t.report ? JSON.parse(t.report) : null; } catch(e){}
      try { parsedScenario = t.scenario ? JSON.parse(t.scenario) : null; } catch(e){}
      
      let summaryText = 'Tree Simulation';
      if (parsedReport && parsedReport.dominantFutures && parsedReport.dominantFutures.length > 0) {
        summaryText = parsedReport.dominantFutures[0].futureName || parsedReport.dominantFutures[0].name || summaryText;
      }

      simulations.push({
        id: t.id,
        type: 'tree',
        tokens_used: t.tokens_used,
        duration_sec: t.duration_sec,
        agent_count: 0,
        tick_count: parsedReport?.tree?.nodes?.length || 0, // Using node count as ticks for UI
        created_at: t.created_at,
        councilal_hypothesis: parsedScenario?.question || 'N/A',
        summary: summaryText,
        report: parsedReport
      });
    });

    simulations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ simulations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v4/admin/reset-tokens
router.post('/admin/reset-tokens', authenticate, requireAdmin, async (req, res) => {
  try {
    const { resetAllUserTokens } = await import('./db_users.js');
    const affected = await resetAllUserTokens(10);
    res.json({ success: true, affected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v4/admin/clear-db
router.post('/admin/clear-db', authenticate, requireAdmin, async (req, res) => {
  try {
    const targetUuid = req.body.targetUuid;

    // 1. Clear Graph Chunks
    const { clearAllData } = await import('../extension/core/memory.js');
    await clearAllData(targetUuid);

    // 2. Clear Simulation Telemetry
    const { getDb } = await import('../simulith/src/db/agent_memory.js');
    const db = await getDb();
    
    if (targetUuid) {
      await db.execute({ sql: 'DELETE FROM mesh_simulations WHERE uuid = ?', args: [targetUuid] });
      await db.execute({ sql: 'DELETE FROM tree_simulations WHERE uuid = ?', args: [targetUuid] });
      await db.execute({ sql: 'DELETE FROM memtrace_rounds WHERE uuid = ?', args: [targetUuid] });
    } else {
      await db.execute('DELETE FROM mesh_simulations');
      await db.execute('DELETE FROM tree_simulations');
      await db.execute('DELETE FROM memtrace_rounds');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/admin/stats
router.get('/admin/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const { getAllUsers } = await import('./db_users.js');
    const users = await getAllUsers();
    
    const { getDb } = await import('../simulith/src/db/agent_memory.js');
    const db = await getDb();
    
    const globalStatsRes = await db.execute(`
      SELECT COUNT(*) as total_simulations, 
             SUM(duration_sec) as total_duration, 
             SUM(tokens_used) as total_tokens 
      FROM mesh_simulations
    `);
    const globalStats = globalStatsRes.rows[0];

    // Map users to include their simulation counts
    const usersWithStats = await Promise.all(users.map(async u => {
      const uStatsRes = await db.execute({
        sql: `
          SELECT COUNT(*) as sim_count,
                 SUM(duration_sec) as duration,
                 SUM(tokens_used) as tokens
          FROM mesh_simulations
          WHERE uuid = ?
        `,
        args: [u.memtrace_uuid]
      });
      return { ...u, stats: uStatsRes.rows[0] };
    }));

    res.json({
      global: {
        totalUsers: users.length,
        totalSimulations: globalStats.total_simulations || 0,
        totalDurationSec: globalStats.total_duration || 0,
        totalTokensUsed: globalStats.total_tokens || 0
      },
      users: usersWithStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/admin/user/:uuid/simulations
router.get('/admin/user/:uuid/simulations', authenticate, requireAdmin, async (req, res) => {
  try {
    const { getDb } = await import('../simulith/src/db/agent_memory.js');
    const db = await getDb();
    
    const meshRes = await db.execute({
      sql: `SELECT id, scenario, agent_count, tick_count, status, created_at, completed_at, tokens_used, duration_sec, report FROM mesh_simulations WHERE uuid = ?`,
      args: [req.params.uuid]
    });

    const councilRes = await db.execute({
      sql: `SELECT id, sim_id, round, global_summary, shock_event, graph_snapshot, created_at, tokens_used, duration_sec FROM memtrace_rounds WHERE uuid = ?`,
      args: [req.params.uuid]
    });

    const simulations = [];

    meshRes.rows.forEach(s => {
      let parsedReport = null;
      let parsedScenario = null;
      try { parsedReport = s.report ? JSON.parse(s.report) : null; } catch(e){}
      try { parsedScenario = s.scenario ? JSON.parse(s.scenario) : null; } catch(e){}
      simulations.push({
        id: s.id,
        type: 'mesh',
        tokens_used: s.tokens_used,
        duration_sec: s.duration_sec,
        agent_count: s.agent_count,
        tick_count: s.tick_count,
        created_at: s.created_at,
        councilal_hypothesis: parsedScenario?.question || 'N/A',
        summary: parsedReport?.summary || parsedReport?.recommendation?.title || 'No Summary',
        report: parsedReport
      });
    });

    councilRes.rows.forEach(p => {
      let parsedGraph = null;
      try { parsedGraph = p.graph_snapshot ? JSON.parse(p.graph_snapshot) : null; } catch(e){}
      simulations.push({
        id: p.id,
        type: 'council',
        tokens_used: p.tokens_used,
        duration_sec: p.duration_sec,
        agent_count: parsedGraph?.nodes?.length || 0,
        tick_count: p.round,
        created_at: p.created_at,
        councilal_hypothesis: 'Council Round ' + p.round,
        summary: p.global_summary,
        global_summary: p.global_summary,
        graph_snapshot: parsedGraph
      });
    });

    simulations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ simulations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/admin/token-requests
router.get('/admin/token-requests', authenticate, requireAdmin, async (req, res) => {
  try {
    const { getPendingTokenRequests } = await import('./db_users.js');
    const requests = await getPendingTokenRequests();
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v4/admin/resolve-token-request
router.post('/admin/resolve-token-request', authenticate, requireAdmin, async (req, res) => {
  try {
    const { requestId, action } = req.body;
    if (!requestId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid requestId or action' });
    }
    const { resolveTokenRequest } = await import('./db_users.js');
    const success = await resolveTokenRequest(requestId, action);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
