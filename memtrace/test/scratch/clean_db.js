import { createClient } from '@libsql/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'users.db');
const dbUrl = process.env.TURSO_DATABASE_URL || `file:${dbPath}`;

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function cleanMockUsers() {
  console.log(`[Clean DB] Connecting to database at ${dbUrl}...`);
  try {
    const res = await db.execute("DELETE FROM users WHERE email LIKE '%mock%' OR google_id LIKE '%mock%'");
    console.log(`[Clean DB] Successfully deleted ${res.rowsAffected} mock user(s).`);
  } catch (e) {
    console.error('[Clean DB] Error deleting mock users:', e.message);
  }
}

cleanMockUsers();
