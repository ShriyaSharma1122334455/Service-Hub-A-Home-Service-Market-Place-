/**
 * backend/tests/app.test.js
 * Basic smoke tests + code quality checks for ServiceHub backend
 * Run: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../server.js'; 
import { createClient } from '@supabase/supabase-js';

// ─── Supabase admin client (service role — bypasses RLS for test cleanup) ─────
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role key, NOT anon key
);

// Track created test user for cleanup
let createdUserId = null;

// ─── Test database - in-memory MongoDB (faster, isolated) ───────────────────────────────────────────────────

beforeAll(async () => {
  
});

afterAll(async () => {
  // Clean up the test user created during the auth tests
  if (createdUserId) {
    await supabase.auth.admin.deleteUser(createdUserId);
  }
});

// ─── 1. Health check ──────────────────────────────────────────────────────────
describe('Health', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
  });
});

// ─── 2. Auth routes ───────────────────────────────────────────────────────────
describe('Auth – /api/auth', () => {
  const testUser = {
    name: 'Test User',
    email: `test_${Date.now()}@example.com`,
    password: 'Password123!',
    role: 'customer',
  };

  it('POST /register rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: testUser.email });
    expect(res.statusCode).toBe(400);
  });

  it('POST /register rejects weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...testUser, email: 'weak@example.com', password: '123' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /login rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'WrongPass!' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── 3. Categories ────────────────────────────────────────────────────────────
describe('Categories – /api/categories', () => {
  it('GET / returns array of categories', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ─── 4. Providers ─────────────────────────────────────────────────────────────
describe('Providers – /api/providers', () => {
  it('GET / returns paginated provider list', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });

  it('GET / supports category filter', async () => {
    const res = await request(app).get('/api/providers?category=plumbing');
    expect(res.statusCode).toBe(200);
  });

  it('GET /:id returns 404 for non-existent provider', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/providers/${fakeId}`);
    expect(res.statusCode).toBe(404);
  });

  it('GET /:id returns 404 for non-UUID id', async () => {
    const res = await request(app).get('/api/providers/not-an-id');
    expect(res.statusCode).toBe(404);
  });
});

// ─── 5. Protected routes ──────────────────────────────────────────────────────
describe('Protected route guard', () => {
  const protectedRoutes = [
    { method: 'get', path: '/api/bookings' },
    { method: 'post', path: '/api/bookings' },
    { method: 'get', path: '/api/users/profile' },
  ];

  protectedRoutes.forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path} requires auth`, async () => {
      const res = await request(app)[method](path);
      expect([401, 403]).toContain(res.statusCode);
    });
  });
});

// ─── 6. Input validation ──────────────────────────────────────────────────────
describe('Input validation', () => {
  it('POST /api/auth/register rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@x.com' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('Responses include Content-Type: application/json', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

// ─── 7. Security headers ──────────────────────────────────────────────────────
describe('Security headers (helmet)', () => {
  it('Response includes X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('Response includes X-Frame-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

// ─── 8. Rate limiting ─────────────────────────────────────────────────────────
describe('Rate limiting', () => {
  it('Returns 429 after exceeding login attempts', async () => {
    const attempts = Array.from({ length: 15 }, () =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'flood@test.com', password: 'wrong' })
    );
    const responses = await Promise.all(attempts);
    const tooMany = responses.filter((r) => r.statusCode === 429);
    expect(tooMany.length).toBeGreaterThan(0);
  }, 15000);
});