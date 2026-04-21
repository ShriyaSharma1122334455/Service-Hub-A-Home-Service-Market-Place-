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

/** Sequential `{ data, error }` for each awaited PostgREST chain (dashboard tests). */
let supabaseAwaitQueue = [];

function createQueuedChainProxy() {
  const handler = {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve) => {
          const next = supabaseAwaitQueue.shift();
          resolve(
            next !== undefined
              ? next
              : { data: null, error: { message: 'test: unexpected extra supabase await' } },
          );
        };
      }
      return jest.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

function mockProviderAuth() {
  setSupabaseClient({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: 'auth-provider-1',
            email: 'provider@test.com',
            user_metadata: { role: 'provider' },
          },
        },
        error: null,
      }),
    },
  });
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
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setSupabaseClient, resetSupabaseClient } from '../middleware/authMiddleware.js';

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

// ─── 5. Provider dashboard – GET /api/dashboard/provider ─────────────────
describe('Provider dashboard – GET /api/dashboard/provider', () => {
  beforeEach(() => {
    supabaseAwaitQueue = [];
    mockFrom.mockImplementation(() => createQueuedChainProxy());
  });

  afterEach(() => {
    resetSupabaseClient();
    mockFrom.mockImplementation(() => createChainProxy());
  });

  it('returns 403 when JWT role is not provider', async () => {
    setSupabaseClient({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-customer-1',
              email: 'c@test.com',
              user_metadata: { role: 'customer' },
            },
          },
          error: null,
        }),
      },
    });

    const res = await request(app)
      .get('/api/dashboard/provider')
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when public.users profile is missing', async () => {
    mockProviderAuth();
    supabaseAwaitQueue.push({ data: null, error: null });

    const res = await request(app)
      .get('/api/dashboard/provider')
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when provider row is missing', async () => {
    mockProviderAuth();
    supabaseAwaitQueue.push(
      { data: { id: 'internal-1', role: 'provider' }, error: null },
      { data: null, error: null },
    );

    const res = await request(app)
      .get('/api/dashboard/provider')
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/provider profile/i);
  });

  it('returns 200 with stats, empty breakdown, and empty calendar when there are no bookings', async () => {
    mockProviderAuth();
    supabaseAwaitQueue.push(
      { data: { id: 'internal-1', role: 'provider' }, error: null },
      {
        data: {
          id: 'prov-1',
          business_name: 'Test Co',
          rating_avg: 4.2,
        },
        error: null,
      },
      { data: [], error: null },
    );

    const res = await request(app)
      .get('/api/dashboard/provider')
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.provider).toEqual({
      id: 'prov-1',
      business_name: 'Test Co',
      rating_avg: 4.2,
    });
    expect(res.body.data.stats).toMatchObject({
      total_bookings: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      total_earnings: 0,
    });
    expect(res.body.data.breakdown).toEqual({ pending: [], confirmed: [] });
    expect(res.body.data.calendar).toEqual([]);
    expect(supabaseAwaitQueue).toHaveLength(0);
  });

  it('aggregates stats, breakdown lists, and calendar (excludes cancelled from calendar)', async () => {
    mockProviderAuth();
    const bookings = [
      {
        id: 'b1',
        status: 'pending',
        scheduled_at: '2026-05-10T14:00:00.000Z',
        total_price: 100,
        service: { name: 'Cleaning' },
        customer: { full_name: 'Alex' },
      },
      {
        id: 'b2',
        status: 'confirmed',
        scheduled_at: '2026-05-10T16:00:00.000Z',
        total_price: 80,
        service: { name: 'Plumbing' },
        customer: { full_name: 'Blake' },
      },
      {
        id: 'b3',
        status: 'completed',
        scheduled_at: '2026-04-01T10:00:00.000Z',
        total_price: 50.25,
        service: { name: 'Electrical' },
        customer: { full_name: 'Casey' },
      },
      {
        id: 'b4',
        status: 'cancelled',
        scheduled_at: '2026-05-11T09:00:00.000Z',
        total_price: 200,
        service: { name: 'Paint' },
        customer: { full_name: 'Dana' },
      },
    ];

    supabaseAwaitQueue.push(
      { data: { id: 'internal-1', role: 'provider' }, error: null },
      {
        data: { id: 'prov-1', business_name: 'Biz', rating_avg: 5 },
        error: null,
      },
      { data: bookings, error: null },
    );

    const res = await request(app)
      .get('/api/dashboard/provider')
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.stats).toMatchObject({
      total_bookings: 4,
      pending: 1,
      confirmed: 1,
      completed: 1,
      cancelled: 1,
      total_earnings: 50.25,
    });

    expect(res.body.data.breakdown.pending).toHaveLength(1);
    expect(res.body.data.breakdown.pending[0]).toMatchObject({
      id: 'b1',
      status: 'pending',
      service_name: 'Cleaning',
      customer_name: 'Alex',
      total_price: 100,
    });

    expect(res.body.data.breakdown.confirmed).toHaveLength(1);
    expect(res.body.data.breakdown.confirmed[0]).toMatchObject({
      id: 'b2',
      status: 'confirmed',
      service_name: 'Plumbing',
    });

    const cal = res.body.data.calendar;
    expect(cal).toHaveLength(2);
    const byDate = Object.fromEntries(cal.map((d) => [d.date, d.items]));
    expect(byDate['2026-04-01'].map((i) => i.id)).toEqual(['b3']);
    expect(byDate['2026-05-10'].map((i) => i.id).sort()).toEqual(['b1', 'b2']);
    expect(cal.some((d) => d.date === '2026-05-11')).toBe(false);
    expect(supabaseAwaitQueue).toHaveLength(0);
  });

  it('returns 403 when internal user role is not provider (stale metadata)', async () => {
    mockProviderAuth();
    supabaseAwaitQueue.push({ data: { id: 'internal-1', role: 'customer' }, error: null });

    const res = await request(app)
      .get('/api/dashboard/provider')
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/only available for provider/i);
  });
});

// ─── 6. Protected routes ──────────────────────────────────────────────────
describe('Protected route guard', () => {
  const protectedRoutes = [
    { method: 'get', path: '/api/bookings' },
    { method: 'post', path: '/api/bookings' },
    { method: 'get', path: '/api/users/profile' },
    { method: 'get', path: '/api/dashboard/provider' },
  ];

  protectedRoutes.forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path} requires auth`, async () => {
      const res = await request(app)[method](path);
      expect([401, 403]).toContain(res.statusCode);
    });
  });
});

// ─── 7. Input validation ──────────────────────────────────────────────────
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

// ─── 8. Security headers ──────────────────────────────────────────────────
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

// ─── 9. 404 handler ──────────────────────────────────────────────────────
describe('404 handler', () => {
  it('Returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.statusCode).toBe(404);
  });
});