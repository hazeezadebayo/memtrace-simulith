import { jest } from '@jest/globals';
import { createTestApp } from './helpers/setup.js';

let request, token1, token2, adminToken, authHeaders;

beforeAll(async () => {
  const ctx = await createTestApp('test_auth.db');
  request = ctx.request;
  token1 = ctx.token1;
  token2 = ctx.token2;
  adminToken = ctx.adminToken;
  authHeaders = ctx.authHeaders;
});

const h1 = () => authHeaders(token1);
const h2 = () => authHeaders(token2);
const hAdmin = () => authHeaders(adminToken);

/* ==================================================================
   PUBLIC ENDPOINTS
   ================================================================== */
describe('Public Endpoints', () => {
  test('GET /api/config — no auth required', async () => {
    const res = await request.get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('google_client_id');
  });

  test('GET /health — no auth required', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

/* ==================================================================
   AUTH MIDDLEWARE
   ================================================================== */
describe('Auth Middleware', () => {
  test('GET /api/auth/me — with valid token returns user info', async () => {
    const res = await request.get('/api/auth/me').set(h1());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uuid', 'user-1');
    expect(res.body).toHaveProperty('email', 'user-1@example.com');
  });

  test('GET /api/auth/me — without token returns 401', async () => {
    const res = await request.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — with expired token returns 401', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const expired = jwt.sign(
      { uuid: 'user-1', email: 'user-1@example.com' },
      process.env.JWT_SECRET || 'test-jwt-secret-012345678901234567890',
      { expiresIn: '0s' }
    );
    await new Promise(r => setTimeout(r, 1100));
    const res = await request.get('/api/auth/me')
      .set('Cookie', `auth_token=${expired}`)
      .set('Origin', 'http://localhost:3005');
    expect(res.status).toBe(401);
  });
});

/* ==================================================================
   ORIGIN ENFORCEMENT
   ================================================================== */
describe('Origin Enforcement (CSRF)', () => {
  test('POST without Origin header returns 403', async () => {
    const res = await request.post('/api/v4/simulate/council')
      .set('Cookie', `auth_token=${token1}`)
      .send({ question: 'Test?', facts: [], branchCount: 2, personaCount: 2 });
    expect(res.status).toBe(403);
  });

  test('GET without Origin header still works (GET exempt)', async () => {
    const res = await request.get('/api/v4/runs')
      .set('Cookie', `auth_token=${token1}`);
    expect(res.status).toBe(200);
  });
});

/* ==================================================================
   USER ENDPOINTS
   ================================================================== */
describe('User Endpoints', () => {
  test('GET /api/v4/user/profile — returns profile', async () => {
    const res = await request.get('/api/v4/user/profile').set(h1());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email', 'user-1@example.com');
    expect(res.body).toHaveProperty('tokens');
  });

  test('GET /api/v4/user/profile — 401 without auth', async () => {
    const res = await request.get('/api/v4/user/profile');
    expect(res.status).toBe(401);
  });

  test('POST /api/v4/user/buy-tokens — creates purchase request', async () => {
    const res = await request.post('/api/v4/user/buy-tokens')
      .set(h2())
      .send({ packageType: 'basic' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  test('GET /api/v4/user/simulations — returns own simulations', async () => {
    const res = await request.get('/api/v4/user/simulations').set(h1());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('simulations');
    expect(Array.isArray(res.body.simulations)).toBe(true);
  });

  test('DELETE /api/v4/user/simulations/:id — returns 404 for non-existent', async () => {
    const res = await request.delete('/api/v4/user/simulations/non-existent').set(h1());
    expect(res.status).toBe(404);
  });
});

/* ==================================================================
   ADMIN ENDPOINTS
   ================================================================== */
describe('Admin Endpoints', () => {
  test('GET /api/v4/admin/stats — non-admin returns 403', async () => {
    const res = await request.get('/api/v4/admin/stats').set(h1());
    expect(res.status).toBe(403);
  });

  test('GET /api/v4/admin/stats — admin returns stats', async () => {
    const res = await request.get('/api/v4/admin/stats').set(hAdmin());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('global');
    expect(res.body.global).toHaveProperty('totalUsers');
    expect(res.body.global).toHaveProperty('totalSimulations');
  });

  test('GET /api/v4/admin/token-requests — admin sees pending', async () => {
    const res = await request.get('/api/v4/admin/token-requests').set(hAdmin());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('requests');
    expect(Array.isArray(res.body.requests)).toBe(true);
  });

  test('POST /api/v4/admin/reset-tokens — admin resets tokens', async () => {
    const res = await request.post('/api/v4/admin/reset-tokens').set(hAdmin());
    expect(res.status).toBe(200);
  });

  test('POST /api/v4/admin/reset-tokens — non-admin 403', async () => {
    const res = await request.post('/api/v4/admin/reset-tokens').set(h1());
    expect(res.status).toBe(403);
  });
});

/* ==================================================================
   CROSS-USER ISOLATION
   ================================================================== */
describe('Cross-User Isolation', () => {
  test('User 1 cannot see User 2 simulations via runs endpoint', async () => {
    await request.post('/api/v4/simulate/council')
      .set(h2())
      .send({
        question: 'User 2 secret project?',
        facts: ['Confidential'],
        branchCount: 2,
        personaCount: 2
      });

    const res1 = await request.get('/api/v4/runs').set(h1());
    const res2 = await request.get('/api/v4/runs').set(h2());

    if (res2.body.runs?.length) {
      const user2RunQuestions = res2.body.runs.map(r => r.scenario?.question);
      const user1RunQuestions = res1.body.runs.map(r => r.scenario?.question);
      const overlap = user2RunQuestions.filter(q => user1RunQuestions.includes(q));
      expect(overlap.length).toBe(0);
    }
  });
});
