/**
 * @fileoverview Tests for authMiddleware.js
 *
 * Uses dependency injection (setSupabaseClient) instead of jest.mock().
 * This works reliably with ESM dynamic imports — no hoisting issues.
 * No real network calls are made in any test.
 */

import { jest } from '@jest/globals';

// ── Set env vars BEFORE importing the middleware ──────────────────────────
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// ── Import middleware using static import (works with ESM) ────────────────
import {
  authenticate,
  requireRole,
  optionalAuthenticate,
  setSupabaseClient,
  resetSupabaseClient,
} from '../middleware/authMiddleware.js';

// ── Mock Supabase client via injection ────────────────────────────────────
const mockGetUser = jest.fn();
const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
};

// Inject the fake client BEFORE any tests run
setSupabaseClient(mockSupabaseClient);

// ── Helpers ───────────────────────────────────────────────────────────────
const mockReq = (headers = {}) => ({ headers, user: undefined });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

// ── Cleanup ───────────────────────────────────────────────────────────────
afterAll(() => {
  resetSupabaseClient();
});

// ═══════════════════════════════════════════════════════════════════════════
// authenticate()
// ═══════════════════════════════════════════════════════════════════════════
describe('authenticate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 401 when Authorization header is missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 401 when header does not start with Bearer', async () => {
    const req = mockReq({ authorization: 'Basic sometoken' });
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 401 when token is empty string after Bearer', async () => {
    const req = mockReq({ authorization: 'Bearer   ' });
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 401 when Supabase returns an error', async () => {
    mockGetUser.mockResolvedValueOnce({ data: null, error: { message: 'Invalid token' } });
    const req = mockReq({ authorization: 'Bearer invalid.token.here' });
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 401 when Supabase returns no user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const req = mockReq({ authorization: 'Bearer valid.but.no.user' });
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('attaches req.user and calls next() on valid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: { id: 'uuid-123', email: 'user@test.com', user_metadata: { role: 'customer' } },
      },
      error: null,
    });
    const req = mockReq({ authorization: 'Bearer valid.token.here' });
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toEqual({
      id: 'uuid-123',
      email: 'user@test.com',
      role: 'customer',
      supabaseId: 'uuid-123',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  test('defaults role to customer when user_metadata.role is absent', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uuid-456', email: 'x@test.com', user_metadata: {} } },
      error: null,
    });
    const req = mockReq({ authorization: 'Bearer some.token' });
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user.role).toBe('customer');
  });

  test('returns 500 when Supabase client throws unexpectedly', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('Network failure'));
    const req = mockReq({ authorization: 'Bearer some.token' });
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// requireRole()
// ═══════════════════════════════════════════════════════════════════════════
describe('requireRole middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 401 if req.user is not set (authenticate skipped)', () => {
    const req = { headers: {} };
    const res = mockRes();
    requireRole('provider')(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 403 when user role is not in allowed list', () => {
    const req = { headers: {}, user: { role: 'customer' } };
    const res = mockRes();
    requireRole('provider')(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('calls next() when user role matches single allowed role', () => {
    const req = { headers: {}, user: { role: 'provider' } };
    const res = mockRes();
    requireRole('provider')(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('calls next() when user role is one of multiple allowed roles', () => {
    const req = { headers: {}, user: { role: 'admin' } };
    const res = mockRes();
    requireRole('provider', 'admin')(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// optionalAuthenticate()
// ═══════════════════════════════════════════════════════════════════════════
describe('optionalAuthenticate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls next() with no req.user when no Authorization header', async () => {
    const req = mockReq({});
    const res = mockRes();
    await optionalAuthenticate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  test('attaches req.user when valid token provided', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: { id: 'uid-789', email: 'opt@test.com', user_metadata: { role: 'provider' } },
      },
      error: null,
    });
    const req = mockReq({ authorization: 'Bearer valid.opt.token' });
    const res = mockRes();
    await optionalAuthenticate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user?.email).toBe('opt@test.com');
  });

  test('still calls next() when Supabase throws (silent failure)', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('Boom'));
    const req = mockReq({ authorization: 'Bearer broken.token' });
    const res = mockRes();
    await optionalAuthenticate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});