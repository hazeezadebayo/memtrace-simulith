import { createClient } from '@libsql/client';

const client = createClient({
  url: 'libsql://memtrace-simulith-hazeezadebayo.aws-eu-west-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM4Njg4MTUsImlkIjoiMDE5ZjU2ZGItNjQwMS03Y2Y4LTkzMGEtZDhiOTdhNjI4YzkyIiwia2lkIjoiU2lFT3FCa0NIRy1NanFSbnQxZjdlVVBQaUJvUWh5WGJnZTFDU3FTVzU0YyIsInJpZCI6IjY5NGNhZmYxLTcyZjMtNGJjZi1hYmY5LTgxMWJhYWEzZjMwYyJ9.lfs0Fy6CnmIGtm5pg-pL5XoKEStF0DVmp1gITXDNtIl3bBpxp6-LkV4n-0lTMYq1FIQ7fEX7vlfNRuhDFLyGCQ'
});

async function run() {
  try {
    await client.execute({
      sql: 'INSERT INTO users (google_id, email, memtrace_uuid, tokens) VALUES (?, ?, ?, ?) ON CONFLICT(google_id) DO UPDATE SET tokens = 1000',
      args: ['google-test-1', 'user-1@example.com', 'user-1', 1000]
    });
    console.log('Inserted user-1 successfully.');
    const users = await client.execute('SELECT * FROM users');
    console.log('Users in database:', users.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.close();
  }
}

run();
