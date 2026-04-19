/**
 * backend/tests/app.test.js
 * Smoke tests + code quality checks for ServiceHub backend (Supabase)
 *
 * These tests exercise the Express routes WITHOUT hitting a real Supabase
 * instance.  The Supabase client module is mocked via jest.unstable_mockModule
 * so that every `supabase.from(...)` and `supabase.auth.*` call returns
 * predictable data.
 *
 * Run: npm test
 */

import { jest } from '@jest/globals';

// ── Mock Supabase BEFORE any app code is imported ─────────────────────────
// jest.unstable_mockModule works with native ESM (--experimental-vm-modules).

// Build a Proxy-based chainable mock that handles any supabase query chain.
// Every chained method (.select, .eq, .order, .limit, .range, .single, etc.)
// returns the same proxy. When awaited, it resolves to { data: [], error: null }.
// Individual tests can override the response via mockFromResult.
let mockFromResult = { data: [], error: null };

function createChainProxy() {
  const handler = {
    get(target, prop) {
      // When awaited, JS calls .then()
      if (prop === 'then') {
        return (resolve) => resolve(mockFromResult);
      }
      // Any chained method returns the proxy itself
      return jest.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

const mockFrom = jest.fn(() => createChainProxy());

// ✅ FIX: use signUp (not admin.createUser) — matches what authController calls
const mockSignUp = jest.fn();
const mockSignIn = jest.fn();

const mockSupabaseClient = {
  from: mockFrom,
  auth: {
    signUp: mockSignUp,
    signInWithPassword: mockSignIn,
  },
};

jest.unstable_mockModule('../config/supabase.js', () => ({
  default: mockSupabaseClient,
  checkSupabaseConnection: jest.fn(),
}));

// ── NOW import the app (after mocks are in place) ─────────────────────────
const { default: app } = await import('../server.js');
import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';

// ── Reset mocks between tests ─────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  mockFromResult = { data: [], error: null };
});

// ─── 1. Health check ──────────────────────────────────────────────────────
describe('Health', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
  });
});

// ─── 2. Auth routes ───────────────────────────────────────────────────────
describe('Auth – /api/auth', () => {
  it('POST /register creates a new user (201)', async () => {
    // ✅ FIX: mock signUp (not createUser), return user + session
    mockSignUp.mockResolvedValueOnce({
      data: {
        user: {
          id: 'uuid-1',
          email: 'test@example.com',
          user_metadata: { role: 'customer' },
        },
        session: { access_token: 'fake-jwt-token' },
      },
      error: null,
    });

    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      password: 'Password123!',
      fullName: 'Test User',
      role: 'customer',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toHaveProperty('id');
  });

  it('POST /register rejects missing fields (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com' });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /register rejects short password (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '123', fullName: 'Test' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /register rejects duplicate email (400)', async () => {
    // ✅ FIX: mock signUp (not createUser)
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: { message: 'User already registered' },
    });

    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@example.com',
      password: 'Password123!',
      fullName: 'Dup User',
      role: 'customer',
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /login returns token for valid credentials', async () => {
    mockSignIn.mockResolvedValueOnce({
      data: {
        session: { access_token: 'fake-jwt-token' },
        user: { id: 'uuid-1', email: 'test@example.com', user_metadata: { role: 'customer' } },
      },
      error: null,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123!' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
  });

  it('POST /login rejects wrong password (401)', async () => {
    // ✅ FIX: this test was getting 200 because the previous test's mockSignIn
    // call was being consumed here. Now that the register test no longer calls
    // mockSignIn, this mock is used correctly.
    mockSignIn.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPass!' });

    expect(res.statusCode).toBe(401);
  });

  it('POST /login rejects missing fields (400)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.statusCode).toBe(400);
  });
});

// ─── 3. Categories ────────────────────────────────────────────────────────
describe('Categories – /api/categories', () => {
  it('GET / returns array of categories', async () => {
    mockFromResult = { data: [], error: null };

    const res = await request(app).get('/api/categories');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── 4. Providers ─────────────────────────────────────────────────────────
describe('Providers – /api/providers', () => {
  it('GET / returns provider list', async () => {
    mockFromResult = { data: [], error: null };

    const res = await request(app).get('/api/providers');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('pagination');
  });

  it('GET /:id returns 404 for non-existent provider', async () => {
    mockFromResult = { data: null, error: { message: 'not found' } };

    const res = await request(app).get('/api/providers/non-existent-uuid');
    expect(res.statusCode).toBe(404);
  });
});

// ─── 5. Protected routes ──────────────────────────────────────────────────
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

// ─── 6. Input validation ──────────────────────────────────────────────────
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

// ─── 7. Security headers ──────────────────────────────────────────────────
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

// ─── 8. 404 handler ──────────────────────────────────────────────────────
describe('404 handler', () => {
  it('Returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.statusCode).toBe(404);
  });
});