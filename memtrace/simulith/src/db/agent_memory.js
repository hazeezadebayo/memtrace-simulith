/* ==================================================================
   simulith/src/agent_memory.js
   SQLite persistence layer for mesh agents, interactions, graph edges.
   Adds three new tables alongside the existing memtrace schema.
   ================================================================== */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export async function getDb() {
  if (db) return db;
  const dbPath = path.resolve(__dirname, '..', '..', '..', 'data', 'memtrace.sqlite');
  const dbUrl = process.env.TURSO_DATABASE_URL || `file:${dbPath}`;
  
  db = createClient({
    url: dbUrl,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  
  try {
    await db.execute('PRAGMA busy_timeout = 5000');
  } catch (e) {
    console.warn('Failed to set PRAGMA busy_timeout on memtrace.sqlite:', e.message);
  }
  
  await _migrate(db);
  return db;
}

async function _migrate(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS mesh_simulations (
      id TEXT PRIMARY KEY,
      uuid TEXT NOT NULL,
      scenario TEXT NOT NULL,
      tick_count INTEGER NOT NULL DEFAULT 0,
      agent_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      report TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      duration_sec INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tree_simulations (
      id TEXT PRIMARY KEY,
      uuid TEXT NOT NULL,
      scenario TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'complete',
      report TEXT,
      created_at TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      duration_sec INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mesh_agents (
      id TEXT PRIMARY KEY,
      sim_id TEXT NOT NULL,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      platforms TEXT,
      backstory TEXT NOT NULL,
      risk_bias REAL,
      evidence_demand REAL,
      clarity_need REAL,
      novelty_seek REAL,
      cluster TEXT,
      beliefs TEXT NOT NULL DEFAULT '{}',
      age INTEGER,
      gender TEXT,
      pseudo_name TEXT,
      region TEXT,
      memory_imprint TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_agents_sim ON mesh_agents(sim_id);

    CREATE TABLE IF NOT EXISTS mesh_interactions (
      id TEXT PRIMARY KEY,
      sim_id TEXT NOT NULL,
      tick INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      type TEXT NOT NULL,
      target_agent_id TEXT,
      target_interaction_id TEXT,
      content TEXT NOT NULL,
      platform TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_interactions_sim ON mesh_interactions(sim_id);
    CREATE INDEX IF NOT EXISTS idx_mesh_interactions_agent ON mesh_interactions(agent_id);

    CREATE TABLE IF NOT EXISTS mesh_edges (
      id TEXT PRIMARY KEY,
      sim_id TEXT NOT NULL,
      src_agent TEXT NOT NULL,
      dst_agent TEXT NOT NULL,
      rel_type TEXT NOT NULL,
      weight REAL NOT NULL,
      valid_at TEXT NOT NULL,
      invalid_at TEXT,
      evidence TEXT
    );

    CREATE TABLE IF NOT EXISTS memtrace_rounds (
      id TEXT PRIMARY KEY,
      sim_id TEXT NOT NULL,
      uuid TEXT NOT NULL,
      round INTEGER NOT NULL,
      global_summary TEXT NOT NULL,
      shock_event TEXT,
      graph_snapshot TEXT,
      created_at TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      duration_sec INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_memtrace_rounds_sim ON memtrace_rounds(sim_id);

    CREATE TABLE IF NOT EXISTS user_settings (
      uuid TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      cluster_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_personas (
      uuid TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      lens TEXT,
      cluster TEXT,
      risk_bias REAL,
      evidence_demand REAL,
      clarity_need REAL,
      novelty_seek REAL,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      reliability REAL DEFAULT 0.5,
      note TEXT,
      PRIMARY KEY (uuid, id)
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      uuid TEXT PRIMARY KEY,
      stats_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_runs (
      uuid TEXT NOT NULL,
      id TEXT NOT NULL,
      run_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (uuid, id)
    );
  `);

  // Safe migration for existing local DBs
  const simCols = await db.execute('PRAGMA table_info(mesh_simulations)');
  if (!simCols.rows.find(c => c.name === 'uuid')) {
    try { await db.execute('ALTER TABLE mesh_simulations ADD COLUMN uuid TEXT DEFAULT ""'); } catch(e) {}
  }
  if (!simCols.rows.find(c => c.name === 'tokens_used')) {
    try {
      await db.execute('ALTER TABLE mesh_simulations ADD COLUMN tokens_used INTEGER NOT NULL DEFAULT 0');
      await db.execute('ALTER TABLE mesh_simulations ADD COLUMN duration_sec INTEGER NOT NULL DEFAULT 0');
    } catch(e) {}
  }

  const mrCols = await db.execute('PRAGMA table_info(memtrace_rounds)');
  if (!mrCols.rows.find(c => c.name === 'id')) {
    try { await db.execute('ALTER TABLE memtrace_rounds ADD COLUMN id TEXT'); } catch(e) {}
  }
  if (!mrCols.rows.find(c => c.name === 'uuid')) {
    try { await db.execute('ALTER TABLE memtrace_rounds ADD COLUMN uuid TEXT DEFAULT ""'); } catch(e) {}
  }
  if (!mrCols.rows.find(c => c.name === 'tokens_used')) {
    try {
      await db.execute('ALTER TABLE memtrace_rounds ADD COLUMN tokens_used INTEGER NOT NULL DEFAULT 0');
      await db.execute('ALTER TABLE memtrace_rounds ADD COLUMN duration_sec INTEGER NOT NULL DEFAULT 0');
    } catch(e) {}
  }

  const saCols = await db.execute('PRAGMA table_info(mesh_agents)');
  if (!saCols.rows.find(c => c.name === 'age')) {
    try { await db.execute('ALTER TABLE mesh_agents ADD COLUMN age INTEGER'); } catch(e) {}
  }
  if (!saCols.rows.find(c => c.name === 'gender')) {
    try { await db.execute('ALTER TABLE mesh_agents ADD COLUMN gender TEXT'); } catch(e) {}
  }
  if (!saCols.rows.find(c => c.name === 'pseudo_name')) {
    try { await db.execute('ALTER TABLE mesh_agents ADD COLUMN pseudo_name TEXT'); } catch(e) {}
  }
  if (!saCols.rows.find(c => c.name === 'region')) {
    try { await db.execute('ALTER TABLE mesh_agents ADD COLUMN region TEXT'); } catch(e) {}
  }
  if (!saCols.rows.find(c => c.name === 'memory_imprint')) {
    try { await db.execute('ALTER TABLE mesh_agents ADD COLUMN memory_imprint TEXT'); } catch(e) {}
  }
  if (!saCols.rows.find(c => c.name === 'platforms')) {
    try { await db.execute('ALTER TABLE mesh_agents ADD COLUMN platforms TEXT'); } catch(e) {}
  }

  const seCols = await db.execute('PRAGMA table_info(mesh_edges)');
  if (!seCols.rows.find(c => c.name === 'id')) {
    try { await db.execute('ALTER TABLE mesh_edges ADD COLUMN id TEXT'); } catch(e) {}
  }
  if (!seCols.rows.find(c => c.name === 'valid_at')) {
    try { await db.execute('ALTER TABLE mesh_edges ADD COLUMN valid_at TEXT'); } catch(e) {}
  }
  if (!seCols.rows.find(c => c.name === 'invalid_at')) {
    try { await db.execute('ALTER TABLE mesh_edges ADD COLUMN invalid_at TEXT'); } catch(e) {}
  }
}

// ─── Simulation ────────────────────────────────────────────────────

export async function createSimulation({ id, uuid, scenario, agentCount, tickCount }) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `
      INSERT INTO mesh_simulations (id, uuid, scenario, agent_count, tick_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'running', ?)
    `,
    args: [id, uuid ?? "", JSON.stringify(scenario), agentCount, tickCount, now]
  });
  return id;
}

export async function completeSimulation(simId, report) {
  const db = await getDb();
  await db.execute({
    sql: `
      UPDATE mesh_simulations
      SET status = 'complete', report = ?, completed_at = ?
      WHERE id = ?
    `,
    args: [JSON.stringify(report), new Date().toISOString(), simId]
  });
}

export async function getSimulation(simId, uuid) {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM mesh_simulations WHERE id = ? AND uuid = ?',
    args: [simId, uuid ?? ""]
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    ...row,
    scenario: JSON.parse(row.scenario || '{}'),
    report: row.report ? JSON.parse(row.report) : null
  };
}

export async function saveTreeSimulation({ id, uuid, scenario, report, tokensUsed, durationSec }) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `
      INSERT INTO tree_simulations (id, uuid, scenario, status, report, created_at, tokens_used, duration_sec)
      VALUES (?, ?, ?, 'complete', ?, ?, ?, ?)
    `,
    args: [id, uuid ?? "", JSON.stringify(scenario), JSON.stringify(report), now, tokensUsed || 0, durationSec || 0]
  });
  return id;
}

// ─── Agents ────────────────────────────────────────────────────────

export async function saveAgent(agent) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `
      INSERT INTO mesh_agents
        (id, sim_id, name, platform, backstory, risk_bias, evidence_demand,
         clarity_need, novelty_seek, cluster, beliefs, age, gender, pseudo_name,
         region, memory_imprint, platforms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        beliefs = excluded.beliefs,
        cluster = excluded.cluster,
        updated_at = excluded.updated_at
    `,
    args: [
      agent.id, agent.simId, agent.name, agent.platform, agent.backstory,
      agent.riskBias, agent.evidenceDemand, agent.clarityNeed, agent.noveltySeek,
      agent.cluster, JSON.stringify(agent.beliefs || {}),
      agent.age || null, agent.gender || null, agent.pseudoName || null,
      agent.region || null, null,
      JSON.stringify(agent.platforms || []), now, now
    ]
  });
}
 
export async function loadAgent(agentId) {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM mesh_agents WHERE id = ?',
    args: [agentId]
  });
  const row = res.rows[0];
  if (!row) return null;
  return _hydrateAgent(row);
}
 
export async function getSimAgents(simId) {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM mesh_agents WHERE sim_id = ?',
    args: [simId]
  });
  return res.rows.map(_hydrateAgent);
}
 
function _hydrateAgent(row) {
  let platforms = [row.platform];
  try {
    if (row.platforms) {
      platforms = JSON.parse(row.platforms);
    }
  } catch (e) {}

  return {
    id: row.id,
    simId: row.sim_id,
    name: row.name,
    platform: row.platform,
    platforms: platforms,
    backstory: row.backstory,
    riskBias: row.risk_bias,
    evidenceDemand: row.evidence_demand,
    clarityNeed: row.clarity_need,
    noveltySeek: row.novelty_seek,
    cluster: row.cluster,
    beliefs: (() => {
      try {
        return JSON.parse(row.beliefs || '{}');
      } catch (e) {
        return {};
      }
    })(),
    age: row.age,
    gender: row.gender,
    pseudoName: row.pseudo_name,
    region: row.region,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ─── Interactions ──────────────────────────────────────────────────

export async function addInteraction(event) {
  const db = await getDb();
  await db.execute({
    sql: `
      INSERT INTO mesh_interactions
        (id, sim_id, tick, agent_id, agent_name, type, target_agent_id,
         target_interaction_id, content, platform, likes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      event.id || randomUUID(),
      event.simId, event.tick, event.agentId, event.agentName || null,
      event.type, event.targetAgentId || null,
      event.targetInteractionId || null,
      event.content, event.platform || null,
      event.likes || 0, event.createdAt || new Date().toISOString()
    ]
  });
  return event;
}

export async function addInteractionBatch(events) {
  const db = await getDb();
  const stmts = events.map(e => ({
    sql: `
      INSERT INTO mesh_interactions
        (id, sim_id, tick, agent_id, agent_name, type, target_agent_id,
         target_interaction_id, content, platform, likes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      e.id || randomUUID(),
      e.simId, e.tick, e.agentId, e.agentName || null,
      e.type, e.targetAgentId || null,
      e.targetInteractionId || null,
      e.content, e.platform || null,
      e.likes || 0, e.createdAt || new Date().toISOString()
    ]
  }));
  
  if (stmts.length > 0) {
    await db.batch(stmts);
  }
}

export async function getSimInteractions(simId, limit = 200) {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM mesh_interactions WHERE sim_id = ? ORDER BY tick ASC, created_at ASC LIMIT ?',
    args: [simId, limit]
  });
  return res.rows;
}

export async function getAgentFeed(agentId, simId, limit = 50) {
  const db = await getDb();
  const res = await db.execute({
    sql: `
      SELECT * FROM mesh_interactions
      WHERE sim_id = ? AND (agent_id = ? OR target_agent_id = ?)
      ORDER BY tick ASC, created_at ASC
      LIMIT ?
    `,
    args: [simId, agentId, agentId, limit]
  });
  return res.rows;
}

// ─── Graph Edges ───────────────────────────────────────────────────

export async function upsertEdge({ simId, srcAgent, dstAgent, relType, weight, evidence }) {
  const db = await getDb();
  const now = new Date().toISOString();
  
  await db.batch([
    {
      sql: `
        UPDATE mesh_edges
        SET invalid_at = ?
        WHERE sim_id = ? AND src_agent = ? AND dst_agent = ? AND rel_type = ? AND invalid_at IS NULL
      `,
      args: [now, simId, srcAgent, dstAgent, relType]
    },
    {
      sql: `
        INSERT INTO mesh_edges (id, sim_id, src_agent, dst_agent, rel_type, weight, valid_at, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [randomUUID(), simId, srcAgent, dstAgent, relType, weight, now, evidence || null]
    }
  ], 'write');
}

export async function getSimEdges(simId) {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM mesh_edges WHERE sim_id = ? AND invalid_at IS NULL',
    args: [simId]
  });
  return res.rows;
}

// ─── MemTrace Rounds ───────────────────────────────────────────────

export async function saveRoundSummary(simId, round, globalSummary, shockEvent, graphSnapshot, uuid) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `
      INSERT INTO memtrace_rounds (id, sim_id, uuid, round, global_summary, shock_event, graph_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        uuid = excluded.uuid,
        global_summary = excluded.global_summary,
        shock_event = excluded.shock_event,
        graph_snapshot = excluded.graph_snapshot
    `,
    args: [
      `${simId}-r${round}`,
      simId,
      uuid,
      round,
      globalSummary,
      shockEvent ? JSON.stringify(shockEvent) : null,
      graphSnapshot ? JSON.stringify(graphSnapshot) : null,
      now
    ]
  });
}

export async function getRoundSummaries(simId, uuid) {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT * FROM memtrace_rounds WHERE sim_id = ? AND uuid = ? ORDER BY round ASC',
    args: [simId, uuid ?? ""]
  });
  return res.rows.map(r => ({
    ...r,
    shock_event: r.shock_event ? JSON.parse(r.shock_event) : null,
    graph_snapshot: r.graph_snapshot ? JSON.parse(r.graph_snapshot) : null
  }));
}

// ─── User UI State (Council) ─────────────────────────────────────────

export async function getUserStateFromDB(uuid) {
  const db = await getDb();
  
  const settingsRes = await db.execute({ sql: 'SELECT settings_json, cluster_version FROM user_settings WHERE uuid = ?', args: [uuid] });
  const statsRes = await db.execute({ sql: 'SELECT stats_json FROM user_stats WHERE uuid = ?', args: [uuid] });
  const personaRes = await db.execute({ sql: 'SELECT * FROM user_personas WHERE uuid = ?', args: [uuid] });
  const runRes = await db.execute({ sql: 'SELECT run_json FROM user_runs WHERE uuid = ? ORDER BY created_at DESC LIMIT 50', args: [uuid] });

  const settingsRow = settingsRes.rows[0];
  const statsRow = statsRes.rows[0];
  const personaRows = personaRes.rows;
  const runRows = runRes.rows;

  const state = {
    settings: settingsRow ? JSON.parse(settingsRow.settings_json) : null,
    clusterVersion: settingsRow ? settingsRow.cluster_version : 1,
    outcomeStats: statsRow ? JSON.parse(statsRow.stats_json) : null,
    personas: personaRows.length > 0 ? personaRows.map(r => ({
      id: r.id,
      name: r.name,
      lens: r.lens,
      cluster: r.cluster,
      riskBias: r.risk_bias,
      evidenceDemand: r.evidence_demand,
      clarityNeed: r.clarity_need,
      noveltySeek: r.novelty_seek,
      wins: r.wins,
      losses: r.losses,
      reliability: r.reliability,
      note: r.note
    })) : null,
    runs: runRows.map(r => JSON.parse(r.run_json))
  };
  return state;
}

export async function saveUserStateToDB(uuid, state) {
  const db = await getDb();
  const now = new Date().toISOString();
  
  const stmts = [];

  // Save Settings
  if (state.settings) {
    stmts.push({
      sql: `
        INSERT INTO user_settings (uuid, settings_json, cluster_version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          settings_json = excluded.settings_json,
          cluster_version = excluded.cluster_version,
          updated_at = excluded.updated_at
      `,
      args: [uuid, JSON.stringify(state.settings), state.clusterVersion || 1, now]
    });
  }

  // Save Stats
  if (state.outcomeStats) {
    stmts.push({
      sql: `
        INSERT INTO user_stats (uuid, stats_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET
          stats_json = excluded.stats_json,
          updated_at = excluded.updated_at
      `,
      args: [uuid, JSON.stringify(state.outcomeStats), now]
    });
  }

  // Save Personas (Delete all existing for user, then insert)
  if (state.personas && state.personas.length > 0) {
    console.log('[DEBUG_PERSONAS] Saving personas:', state.personas.map(p => ({ id: p.id, name: p.name })));
    stmts.push({
      sql: 'DELETE FROM user_personas WHERE uuid = ?',
      args: [uuid]
    });
    for (const p of state.personas) {
      stmts.push({
        sql: `
          INSERT INTO user_personas (
            uuid, id, name, lens, cluster, risk_bias, evidence_demand, 
            clarity_need, novelty_seek, wins, losses, reliability, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          uuid, p.id, p.name, p.lens || null, p.cluster || null,
          p.riskBias || 0.5, p.evidenceDemand || 0.5, p.clarityNeed || 0.5, p.noveltySeek || 0.5,
          p.wins || 0, p.losses || 0, p.reliability || 0.5, p.note || null
        ]
      });
    }
  }

  // Save Runs (We only keep the latest 50, handled outside, just insert or replace)
  if (state.runs) {
    for (const r of state.runs) {
      stmts.push({
        sql: `
          INSERT INTO user_runs (uuid, id, run_json, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(uuid, id) DO UPDATE SET
            run_json = excluded.run_json
        `,
        args: [uuid, r.id, JSON.stringify(r), r.createdAt || now]
      });
    }
  }
  
  if (stmts.length > 0) {
    const sanitizedStmts = stmts.map(s => ({
      sql: s.sql,
      args: (s.args || []).map(val => val === undefined ? null : val)
    }));
    await db.batch(sanitizedStmts, 'write');
  }
}

export async function updateSimulationUsage(simId, uuid, tokens, durationSec) {
  const db = await getDb();
  await db.execute({
    sql: `
      UPDATE mesh_simulations 
      SET tokens_used = tokens_used + ?, duration_sec = duration_sec + ? 
      WHERE id = ? AND uuid = ?
    `,
    args: [tokens, durationSec, simId, uuid ?? ""]
  });
}

export async function updateSimulithUsage(simId, uuid, tokens, durationSec) {
  const db = await getDb();
  await db.execute({
    sql: `
      UPDATE memtrace_rounds 
      SET tokens_used = tokens_used + ?, duration_sec = duration_sec + ? 
      WHERE sim_id = ? AND uuid = ?
    `,
    args: [tokens, durationSec, simId, uuid ?? ""]
  });
}

export async function deleteSimulation(simId, uuid, type) {
  const db = await getDb();
  
  if (type === 'mesh') {
    // Verify ownership
    const simsRes = await db.execute({
      sql: 'SELECT id FROM mesh_simulations WHERE id = ? AND uuid = ?',
      args: [simId, uuid ?? ""]
    });
    if (simsRes.rows.length === 0) return false;
    
    await db.batch([
      { sql: `DELETE FROM mesh_interactions WHERE sim_id = ?`, args: [simId] },
      { sql: `DELETE FROM mesh_edges WHERE sim_id = ?`, args: [simId] },
      { sql: `DELETE FROM mesh_agents WHERE sim_id = ?`, args: [simId] },
      { sql: `DELETE FROM mesh_simulations WHERE id = ?`, args: [simId] }
    ], 'write');
    return true;
  } else if (type === 'council') {
    const councilRes = await db.execute({
      sql: 'DELETE FROM memtrace_rounds WHERE id = ? AND uuid = ?',
      args: [simId, uuid ?? ""]
    });
    return councilRes.rowsAffected > 0;
  } else if (type === 'tree') {
    const treeRes = await db.execute({
      sql: 'DELETE FROM tree_simulations WHERE id = ? AND uuid = ?',
      args: [simId, uuid ?? ""]
    });
    return treeRes.rowsAffected > 0;
  }
  return false;
}


