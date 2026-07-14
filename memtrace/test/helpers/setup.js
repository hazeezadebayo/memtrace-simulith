import { createClient } from '@libsql/client';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import supertest from 'supertest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export async function createTestApp(dbName = 'test_memtrace.db') {
  const testDbPath = path.join(root, 'data', dbName);

  // Clean up test DB from previous runs
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { fs.unlinkSync(testDbPath + suffix); } catch {}
  }

  // Set env vars BEFORE importing the app
  process.env.MOCK_LLM = 'true';
  process.env.SKIP_XENOVA = 'true';
  process.env.TEST_MODE = 'true';
  process.env.JWT_SECRET = 'test-jwt-secret-012345678901234567890';
  process.env.TURSO_DATABASE_URL = `file:${testDbPath}`;
  process.env.ADMIN_EMAILS = 'admin@example.com';

  // Seed test users into the database
  const usersDb = createClient({ url: process.env.TURSO_DATABASE_URL });
  await usersDb.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    memtrace_uuid TEXT UNIQUE NOT NULL,
    tokens INTEGER DEFAULT 1000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await usersDb.execute(`CREATE TABLE IF NOT EXISTS token_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memtrace_uuid TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await usersDb.execute('DELETE FROM users');
  await usersDb.execute('DELETE FROM token_requests');

  // user-1: normal user with 1000 tokens
  await usersDb.execute({
    sql: 'INSERT INTO users (google_id, email, memtrace_uuid, tokens) VALUES (?, ?, ?, ?)',
    args: ['google-1', 'user-1@example.com', 'user-1', 1000]
  });
  // user-2: normal user with 1000 tokens
  await usersDb.execute({
    sql: 'INSERT INTO users (google_id, email, memtrace_uuid, tokens) VALUES (?, ?, ?, ?)',
    args: ['google-2', 'user-2@example.com', 'user-2', 1000]
  });
  // user-3: normal user with 1000 tokens
  await usersDb.execute({
    sql: 'INSERT INTO users (google_id, email, memtrace_uuid, tokens) VALUES (?, ?, ?, ?)',
    args: ['google-3', 'user-3@example.com', 'user-3', 1000]
  });
  // admin-user: has admin email
  await usersDb.execute({
    sql: 'INSERT INTO users (google_id, email, memtrace_uuid, tokens) VALUES (?, ?, ?, ?)',
    args: ['google-admin', 'admin@example.com', 'admin-user', 5000]
  });
  // user-low: has only 5 tokens (for token check tests)
  await usersDb.execute({
    sql: 'INSERT INTO users (google_id, email, memtrace_uuid, tokens) VALUES (?, ?, ?, ?)',
    args: ['google-low', 'low@example.com', 'user-low', 5]
  });

  await usersDb.execute("INSERT INTO token_requests (memtrace_uuid, amount, status) VALUES ('user-1', 150, 'pending')");
  usersDb.close();

  // Import the full Express app (side effects: sets up all routers, DB connections)
  const { default: app } = await import('../../api/memtrace_server.js');
  const request = supertest(app);

  // Create JWT tokens for test users
  const jwtSecret = process.env.JWT_SECRET;
  const signOpts = { expiresIn: '1h' };
  const token1 = jwt.sign({ uuid: 'user-1', email: 'user-1@example.com' }, jwtSecret, signOpts);
  const token2 = jwt.sign({ uuid: 'user-2', email: 'user-2@example.com' }, jwtSecret, signOpts);
  const token3 = jwt.sign({ uuid: 'user-3', email: 'user-3@example.com' }, jwtSecret, signOpts);
  const adminToken = jwt.sign({ uuid: 'admin-user', email: 'admin@example.com' }, jwtSecret, signOpts);
  const lowToken = jwt.sign({ uuid: 'user-low', email: 'low@example.com' }, jwtSecret, signOpts);

  const authHeaders = (token, origin = 'http://localhost:3005') => ({
    'Cookie': `auth_token=${token}`,
    'Origin': origin,
  });

  return { app, request, token1, token2, token3, adminToken, lowToken, authHeaders };
}
