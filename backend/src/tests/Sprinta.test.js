/**
 * @fileoverview Sprint A bug-fix regression tests
 *
 * Covers every Sprint A fix in one file so the entire sprint can be verified
 * with a single `npm test -- --testPathPattern=sprintA` command.
 *
 * Fixes verified:
 *  A-01  CRIT-01 — getBooking ownership check (SEC-15, FT-BK-06)
 *  A-02  CRIT-02 — updateService / deleteService ownership check (UT-SVC-03)
 *  A-03  CRIT-03 — admin guard on listUsers / getUser (SEC-06)
 *  A-04  CRIT-04 — acceptBooking / completeBooking atomic status guard (LOAD-08)
 *  A-05  CRIT-05 — self-booking prevention (UT-BK-01)
 *  A-06  CRIT-06 — Supabase auth metadata sync on role upgrade (INT-AUTH-05)
 *  A-07  HIGH-03 — req.body whitelist in updateService (SEC-11)
 *  A-08  HIGH-06 — scheduled_at future-date validation (UT-BK-02)
 *  A-09  HIGH-04 — POST /auth/register rate-limited (SEC-24)
 *  A-10  MED-04  — VITE_ key fallback removed from authMiddleware (SEC-23)
 *  A-11  MED-06  — service/provider ownership validated in createBooking (UT-BK-01)
 */

// ── Environment MUST be set before any import ─────────────────────────────
import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';

process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.NODE_ENV                  = 'test';
process.env.VDA_SERVICE_URL           = 'https://vda.test';
process.env.VDA_SERVICE_API_KEY       = 'vda-test-key';

// ── Mock file-type BEFORE server.js is imported ───────────────────────────
// assessmentController.js imports file-type at module level. Without this
// mock the suite crashes with "Cannot find module 'file-type'" when Jest
// tries to resolve it as a native ESM package.
await jest.unstable_mockModule('file-type', () => ({
  fileTypeFromBuffer: jest.fn().mockResolvedValue({ mime: 'image/jpeg' }),
}));

// ── Mock every module assessmentController pulls in ───────────────────────
await jest.unstable_mockModule('../services/catalogMatchmaking.js', () => ({
  matchAssessmentToCatalog: jest.fn().mockResolvedValue({ recommended_services: [] }),
  default: { matchAssessmentToCatalog: jest.fn() },
}));
await jest.unstable_mockModule('../utils/vdaErrorNormalizer.js', () => ({
  normalizeVdaError: jest.fn().mockReturnValue({ userMessage: 'error', logDetails: 'details' }),
}));
await jest.unstable_mockModule('../utils/quoteEstimator.js', () => ({
  buildNegotiationQuote: jest.fn().mockReturnValue({
    recommended_usd: 100, fair_min_usd: 80, ceiling_usd: 150, negotiation_guidance: 'ok',
  }),
}));
await jest.unstable_mockModule('../utils/retryWithBackoff.js', () => ({
  retryWithBackoff: jest.fn().mockImplementation((fn) => fn()),
}));
await jest.unstable_mockModule('../utils/vdaResponseValidator.js', () => ({
  validateAndSanitizeVdaResponse: jest.fn().mockImplementation((x) => x),
}));

// ── Mock vdaServiceConfig so validateVdaServiceConfig never throws ────────
await jest.unstable_mockModule('../config/vdaServiceConfig.js', () => ({
  validateVdaServiceConfig: jest.fn(),
  default: { validateVdaServiceConfig: jest.fn() },
}));

// ── Supabase queue mock ───────────────────────────────────────────────────
let supabaseQueue = [];

function makeChainProxy() {
  const handler = {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve) => {
          const next = supabaseQueue.shift();
          resolve(
            next !== undefined
              ? next
              : { data: null, error: { message: 'test: unexpected supabase call' } },
          );
        };
      }
      return jest.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

const mockSignUp          = jest.fn();
const mockSignIn          = jest.fn();
const mockAdminUpdateUser = jest.fn().mockResolvedValue({ data: {}, error: null });
let   mockFrom            = jest.fn(() => makeChainProxy());

const mockSupabaseModule = {
  default: {
    get from() { return (...args) => mockFrom(...args); },
    auth: {
      signUp:             mockSignUp,
      signInWithPassword: mockSignIn,
      admin: { updateUserById: mockAdminUpdateUser },
    },
  },
  checkSupabaseConnection: jest.fn(),
};

await jest.unstable_mockModule('../config/supabase.js', () => mockSupabaseModule);

// ── Import app and helpers AFTER all mocks are registered ─────────────────
const { default: app }                           = await import('../server.js');
const { setSupabaseClient, resetSupabaseClient } = await import('../middleware/authMiddleware.js');
const request                                    = (await import('supertest')).default;

// ── Auth helpers ──────────────────────────────────────────────────────────
function mockAs(role) {
  setSupabaseClient({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id:            `auth-${role}-1`,
            email:         `${role}@test.com`,
            user_metadata: { role },
          },
        },
        error: null,
      }),
      admin: { updateUserById: mockAdminUpdateUser },
    },
  });
}

function queue(...items) { supabaseQueue.push(...items); }

// ── Fixtures ──────────────────────────────────────────────────────────────
const INTERNAL_CUSTOMER  = { id: 'user-cust-1', role: 'customer' };
const INTERNAL_PROVIDER  = { id: 'user-prov-1', role: 'provider' };
const SERVICE_OK         = { id: 'svc-1', base_price: 100, provider_id: 'prov-1', is_active: true };
const SERVICE_OTHER_PROV = { id: 'svc-2', base_price: 80,  provider_id: 'prov-other', is_active: true };
const BOOKING_PENDING    = { id: 'bk-1', customer_id: 'user-cust-1', provider_id: 'prov-1', status: 'pending' };
const BOOKING_CONFIRMED  = { id: 'bk-1', customer_id: 'user-cust-1', provider_id: 'prov-1', status: 'confirmed' };

// ── Global cleanup ────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  supabaseQueue = [];
  mockAdminUpdateUser.mockResolvedValue({ data: {}, error: null });
  mockFrom = jest.fn(() => makeChainProxy());
});

afterEach(() => { resetSupabaseClient(); });
afterAll(()  => { resetSupabaseClient(); });

// ═════════════════════════════════════════════════════════════════════════════
// A-01 · CRIT-01 — getBooking ownership check
// ═════════════════════════════════════════════════════════════════════════════
describe('A-01 · getBooking — ownership check', () => {
  it('returns 403 when a customer requests another customer\'s booking', async () => {
    mockAs('customer');
    queue(
      { data: INTERNAL_CUSTOMER, error: null },
      { data: { ...BOOKING_PENDING, customer_id: 'user-cust-OTHER' }, error: null },
    );
    const res = await request(app).get('/api/bookings/bk-1').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 when the booking\'s own customer requests it', async () => {
    mockAs('customer');
    queue(
      { data: INTERNAL_CUSTOMER, error: null },
      { data: BOOKING_PENDING, error: null },
    );
    const res = await request(app).get('/api/bookings/bk-1').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 when the assigned provider requests the booking', async () => {
    mockAs('provider');
    // Call order in getBooking():
    //   1. getInternalUser  → INTERNAL_PROVIDER
    //   2. booking fetch    → BOOKING_PENDING   (happens BEFORE resolveProviderId)
    //   3. resolveProviderId → { id: 'prov-1' }
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: BOOKING_PENDING, error: null },
      { data: { id: 'prov-1' }, error: null },   // resolveProviderId — called after booking fetch
    );
    const res = await request(app).get('/api/bookings/bk-1').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when booking does not exist', async () => {
    mockAs('customer');
    queue(
      { data: INTERNAL_CUSTOMER, error: null },
      { data: null, error: { message: 'not found' } },
    );
    const res = await request(app).get('/api/bookings/nonexistent').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-02 · CRIT-02 — updateService / deleteService ownership
// ═════════════════════════════════════════════════════════════════════════════
describe('A-02 · updateService — ownership check', () => {
  it('returns 403 when provider updates another provider\'s service', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: null, error: null },               // update → 0 rows
      { data: { id: 'svc-2' }, error: null },    // exists → belongs to another
    );
    const res = await request(app)
      .put('/api/services/svc-2').set('Authorization', 'Bearer tok').send({ name: 'Hack' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  it('returns 200 when provider updates their own service', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: { id: 'svc-1', name: 'Updated', provider_id: 'prov-1' }, error: null },
    );
    const res = await request(app)
      .put('/api/services/svc-1').set('Authorization', 'Bearer tok').send({ name: 'Updated' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });
});

describe('A-02 · deleteService — ownership check', () => {
  it('returns 403 when provider deletes another provider\'s service', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: [], error: null },                       // delete → 0 rows
      { data: { id: 'svc-other' }, error: null },      // exists → belongs to another
    );
    const res = await request(app).delete('/api/services/svc-other').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 when provider deletes their own service', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: [{ id: 'svc-1' }], error: null },
    );
    const res = await request(app).delete('/api/services/svc-1').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-03 · CRIT-03 — Admin guard on listUsers / getUser
// ═════════════════════════════════════════════════════════════════════════════
describe('A-03 · listUsers — admin guard', () => {
  it('returns 403 for customer JWT', async () => {
    mockAs('customer');
    const res = await request(app).get('/api/users').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for provider JWT', async () => {
    mockAs('provider');
    const res = await request(app).get('/api/users').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 for admin JWT', async () => {
    mockAs('admin');
    queue({ data: [], error: null });
    const res = await request(app).get('/api/users').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(200);
  });
});

describe('A-03 · getUser — admin guard', () => {
  it('returns 403 for customer JWT', async () => {
    mockAs('customer');
    const res = await request(app).get('/api/users/some-id').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-04 · CRIT-04 — Atomic status guard in acceptBooking / completeBooking
// ═════════════════════════════════════════════════════════════════════════════
describe('A-04 · acceptBooking — atomic status guard', () => {
  it('returns 409 when booking is already confirmed', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: BOOKING_CONFIRMED, error: null },
    );
    const res = await request(app).put('/api/bookings/bk-1/accept').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/confirmed/i);
  });

  it('returns 200 for a valid pending booking', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: BOOKING_PENDING, error: null },
      { data: { ...BOOKING_PENDING, status: 'confirmed' }, error: null },
    );
    const res = await request(app).put('/api/bookings/bk-1/accept').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
  });

  it('returns 409 when UPDATE returns 0 rows (race condition simulated)', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: BOOKING_PENDING, error: null },
      { data: null, error: null },               // 0 rows → race lost
    );
    const res = await request(app).put('/api/bookings/bk-1/accept').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(409);
  });
});

describe('A-04 · completeBooking — atomic status guard', () => {
  it('returns 409 when status is not confirmed', async () => {
    mockAs('provider');
    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: BOOKING_PENDING, error: null },
    );
    const res = await request(app).put('/api/bookings/bk-1/complete').set('Authorization', 'Bearer tok');
    expect(res.statusCode).toBe(409);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-05 · CRIT-05 — Self-booking prevention
// ═════════════════════════════════════════════════════════════════════════════
describe('A-05 · createBooking — self-booking prevention', () => {
  const TOMORROW = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

  it('returns 400 when the booking customer_id matches the provider\'s user_id (self-booking)', async () => {
    // POST /api/bookings requires role:'customer' at the route level.
    // Self-booking happens when a user registers as customer AND as provider
    // using the same account — so we mock as customer but set the provider row's
    // user_id to match the internal customer id.
    mockAs('customer');
    queue(
      { data: [], error: null },                 // no slot conflict
      // provider.user_id === internalUser.id  → self-booking detected
      { data: { id: 'prov-1', verification_status: 'verified', user_id: 'user-cust-1' }, error: null },
      { data: INTERNAL_CUSTOMER, error: null },   // internalUser.id === 'user-cust-1'
    );
    const res = await request(app)
      .post('/api/bookings').set('Authorization', 'Bearer tok')
      .send({ provider_id: 'prov-1', service_id: 'svc-1', scheduled_at: TOMORROW });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cannot book your own/i);
  });

  it('allows a customer to book a verified provider', async () => {
    mockAs('customer');
    queue(
      { data: [], error: null },
      { data: { id: 'prov-1', verification_status: 'verified', user_id: 'user-prov-1' }, error: null },
      { data: INTERNAL_CUSTOMER, error: null },   // different user_id → OK
      { data: SERVICE_OK, error: null },
      { data: { id: 'bk-new', status: 'pending' }, error: null },
    );
    const res = await request(app)
      .post('/api/bookings').set('Authorization', 'Bearer tok')
      .send({ provider_id: 'prov-1', service_id: 'svc-1', scheduled_at: TOMORROW });
    expect(res.statusCode).toBe(201);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-06 · CRIT-06 — Supabase auth metadata sync on role upgrade
// ═════════════════════════════════════════════════════════════════════════════
describe('A-06 · updateUserRole — auth metadata sync', () => {
  it('calls auth.admin.updateUserById and returns requiresReauth: true', async () => {
    mockAs('customer');
    queue(
      { data: { id: 'user-cust-1', role: 'customer' }, error: null },
      { data: { id: 'user-cust-1', role: 'provider', full_name: 'Test', email: 'c@test.com', avatar_url: null }, error: null },
      { data: { id: 'prov-new', business_name: 'Test', description: '', rating_avg: 0, rating_count: 0 }, error: null },
    );
    const res = await request(app)
      .put('/api/users/me/role').set('Authorization', 'Bearer tok').send({ role: 'provider' });
    expect(res.statusCode).toBe(200);
    expect(res.body.requiresReauth).toBe(true);
    expect(mockAdminUpdateUser).toHaveBeenCalledWith(
      'auth-customer-1',
      { user_metadata: { role: 'provider' } },
    );
  });

  it('returns 400 when a provider tries to re-upgrade', async () => {
    mockAs('customer');
    queue({ data: { id: 'user-prov-1', role: 'provider' }, error: null });
    const res = await request(app)
      .put('/api/users/me/role').set('Authorization', 'Bearer tok').send({ role: 'provider' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/only customers/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-07 · HIGH-03 — req.body whitelist (mass-assignment prevention)
// ═════════════════════════════════════════════════════════════════════════════
describe('A-07 · updateService — provider_id cannot be injected', () => {
  it('strips provider_id from the DB update payload', async () => {
    mockAs('provider');

    const updatePayloads = [];
    mockFrom = jest.fn((table) => {
      const handler = {
        get(_, prop) {
          if (prop === 'update' && table === 'services') {
            return (payload) => { updatePayloads.push(payload); return new Proxy({}, handler); };
          }
          if (prop === 'then') {
            return (resolve) => { resolve(supabaseQueue.shift() ?? { data: null, error: null }); };
          }
          return jest.fn().mockReturnValue(new Proxy({}, handler));
        },
      };
      return new Proxy({}, handler);
    });

    queue(
      { data: INTERNAL_PROVIDER, error: null },
      { data: { id: 'prov-1' }, error: null },
      { data: { id: 'svc-1', name: 'Legit', provider_id: 'prov-1' }, error: null },
    );

    await request(app)
      .put('/api/services/svc-1').set('Authorization', 'Bearer tok')
      .send({ name: 'Legit', provider_id: 'evil-uuid' });

    mockFrom = jest.fn(() => makeChainProxy());   // restore

    expect(updatePayloads[0]).toBeDefined();
    expect(updatePayloads[0].provider_id).toBeUndefined();
    expect(updatePayloads[0].name).toBe('Legit');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-08 · HIGH-06 — scheduled_at future-date validation
// ═════════════════════════════════════════════════════════════════════════════
describe('A-08 · createBooking — scheduled_at validation', () => {
  it('returns 400 for a past date', async () => {
    mockAs('customer');
    const res = await request(app)
      .post('/api/bookings').set('Authorization', 'Bearer tok')
      .send({ provider_id: 'p', service_id: 's', scheduled_at: new Date(Date.now() - 60_000).toISOString() });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/30 minutes/i);
  });

  it('returns 400 for an invalid date string', async () => {
    mockAs('customer');
    const res = await request(app)
      .post('/api/bookings').set('Authorization', 'Bearer tok')
      .send({ provider_id: 'p', service_id: 's', scheduled_at: 'not-a-date' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/ISO 8601/i);
  });

  it('returns 400 when only 10 minutes in the future', async () => {
    mockAs('customer');
    const res = await request(app)
      .post('/api/bookings').set('Authorization', 'Bearer tok')
      .send({ provider_id: 'p', service_id: 's', scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/30 minutes/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-09 · HIGH-04 — POST /auth/register rate limiter present
// ═════════════════════════════════════════════════════════════════════════════
describe('A-09 · /auth/register — rate limiter applied', () => {
  it('response includes RateLimit headers', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'x@test.com', user_metadata: { role: 'customer' } }, session: null },
      error: null,
    });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@test.com', password: 'Password1!', fullName: 'Test' });
    const limitHeader = res.headers['ratelimit-limit'] ?? res.headers['x-ratelimit-limit'];
    expect(limitHeader).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-10 · MED-04 — VITE_ key fallback removed from authMiddleware
// ═════════════════════════════════════════════════════════════════════════════
describe('A-10 · authMiddleware — VITE_ fallback removed', () => {
  it('returns 500 when server env vars are absent (does NOT fall back to VITE_ key)', async () => {
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.VITE_SUPABASE_URL              = 'https://vite-leak.supabase.co';
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = 'should-never-be-used';
    resetSupabaseClient();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await request(app).get('/api/users/me').set('Authorization', 'Bearer any-token');
    expect(res.statusCode).toBe(500);

    process.env.SUPABASE_URL              = origUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
    resetSupabaseClient();
    setSupabaseClient(mockSupabaseModule.default);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A-11 · MED-06 — Service belongs to provider validation
// ═════════════════════════════════════════════════════════════════════════════
describe('A-11 · createBooking — service/provider ownership', () => {
  const TOMORROW = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

  it('returns 400 when service belongs to a different provider', async () => {
    mockAs('customer');
    queue(
      { data: [], error: null },
      { data: { id: 'prov-1', verification_status: 'verified', user_id: 'user-prov-1' }, error: null },
      { data: INTERNAL_CUSTOMER, error: null },
      { data: SERVICE_OTHER_PROV, error: null },   // provider_id mismatch
    );
    const res = await request(app)
      .post('/api/bookings').set('Authorization', 'Bearer tok')
      .send({ provider_id: 'prov-1', service_id: 'svc-2', scheduled_at: TOMORROW });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/does not belong/i);
  });

  it('returns 400 when service is inactive', async () => {
    mockAs('customer');
    queue(
      { data: [], error: null },
      { data: { id: 'prov-1', verification_status: 'verified', user_id: 'user-prov-1' }, error: null },
      { data: INTERNAL_CUSTOMER, error: null },
      { data: { ...SERVICE_OK, is_active: false }, error: null },
    );
    const res = await request(app)
      .post('/api/bookings').set('Authorization', 'Bearer tok')
      .send({ provider_id: 'prov-1', service_id: 'svc-1', scheduled_at: TOMORROW });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no longer available/i);
  });
});