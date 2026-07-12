import { createClient } from '@libsql/client';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'users.db');
const dbUrl = process.env.TURSO_DATABASE_URL || `file:${dbPath}`;

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Set busy timeout to prevent lock contention
try {
  await db.execute('PRAGMA busy_timeout = 5000');
} catch (e) {
  console.warn('Failed to set PRAGMA busy_timeout on users.db:', e.message);
}

// Initialize table (top-level await is supported in ES modules)
await db.execute(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    memtrace_uuid TEXT UNIQUE NOT NULL,
    tokens INTEGER DEFAULT 1000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

await db.execute(`
  CREATE TABLE IF NOT EXISTS token_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memtrace_uuid TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migration for existing users table
const userCols = await db.execute('PRAGMA table_info(users)');
if (!userCols.rows.find(c => c.name === 'tokens')) {
  try {
    await db.execute('ALTER TABLE users ADD COLUMN tokens INTEGER DEFAULT 1000');
  } catch (e) { /* ignore if exists */ }
}

/**
 * Gets or creates a user mapping for a given Google Profile
 */
export async function getOrCreateUser(googleProfile) {
  const { id: google_id, email } = googleProfile;
  
  let res = await db.execute({
    sql: 'SELECT * FROM users WHERE google_id = ?',
    args: [google_id]
  });
  
  if (res.rows.length === 0) {
    const memtrace_uuid = crypto.randomUUID();
    await db.execute({
      sql: 'INSERT INTO users (google_id, email, memtrace_uuid, tokens) VALUES (?, ?, ?, 500)',
      args: [google_id, email, memtrace_uuid]
    });
    res = await db.execute({
      sql: 'SELECT * FROM users WHERE google_id = ?',
      args: [google_id]
    });
  }
  
  return res.rows[0];
}

export async function getUser(uuid) {
  const res = await db.execute({
    sql: 'SELECT * FROM users WHERE memtrace_uuid = ?',
    args: [uuid]
  });
  return res.rows[0];
}

export async function getAllUsers() {
  const res = await db.execute('SELECT memtrace_uuid, email, tokens, created_at FROM users ORDER BY created_at DESC');
  return res.rows;
}

export async function addTokens(uuid, amount) {
  const info = await db.execute({
    sql: 'UPDATE users SET tokens = tokens + ? WHERE memtrace_uuid = ?',
    args: [amount, uuid]
  });
  return info.rowsAffected > 0;
}

export async function deductToken(uuid) {
  // If user doesn't exist, we do not create a mock user anymore.
  // Instead, we just return false (deduction failed).
  const res = await db.execute({
    sql: 'SELECT * FROM users WHERE memtrace_uuid = ?',
    args: [uuid]
  });
  if (res.rows.length === 0) {
    return false;
  }

  // Deduct 1 token only if tokens > 0
  const info = await db.execute({
    sql: 'UPDATE users SET tokens = tokens - 1 WHERE memtrace_uuid = ? AND tokens > 0',
    args: [uuid]
  });
  return info.rowsAffected > 0;
}

export async function refundToken(uuid) {
  const info = await db.execute({
    sql: 'UPDATE users SET tokens = tokens + 1 WHERE memtrace_uuid = ?',
    args: [uuid]
  });
  return info.rowsAffected > 0;
}

export async function resetAllUserTokens(defaultAmount = 500) {
  const info = await db.execute({
    sql: 'UPDATE users SET tokens = ?',
    args: [defaultAmount]
  });
  return info.rowsAffected;
}

export async function createTokenRequest(uuid, amount) {
  const info = await db.execute({
    sql: "INSERT INTO token_requests (memtrace_uuid, amount, status) VALUES (?, ?, 'pending')",
    args: [uuid, amount]
  });
  return info.rowsAffected > 0;
}

export async function hasPendingTokenRequest(uuid) {
  const res = await db.execute({
    sql: "SELECT 1 FROM token_requests WHERE memtrace_uuid = ? AND status = 'pending' LIMIT 1",
    args: [uuid]
  });
  return res.rows.length > 0;
}

export async function getPendingTokenRequests() {
  const res = await db.execute(`
    SELECT r.id, r.memtrace_uuid, r.amount, r.created_at, u.email 
    FROM token_requests r
    LEFT JOIN users u ON r.memtrace_uuid = u.memtrace_uuid
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `);
  return res.rows;
}

export async function resolveTokenRequest(requestId, action) {
  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  
  if (action === 'approve') {
    // We must fetch the request to get the amount and uuid
    const res = await db.execute({
      sql: 'SELECT memtrace_uuid, amount FROM token_requests WHERE id = ? AND status = ?',
      args: [requestId, 'pending']
    });
    
    if (res.rows.length === 0) return false;
    
    const { memtrace_uuid, amount } = res.rows[0];
    
    // Add the tokens
    await addTokens(memtrace_uuid, amount);
  }
  
  // Update status
  const info = await db.execute({
    sql: 'UPDATE token_requests SET status = ? WHERE id = ?',
    args: [newStatus, requestId]
  });
  
  return info.rowsAffected > 0;
}
