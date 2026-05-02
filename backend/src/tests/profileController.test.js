/**
 * @fileoverview Tests for updateUserProfile in userController.js
 *
 * Mocks the Supabase client via module mock so no real DB calls are made.
 */

import { jest } from '@jest/globals';

// ── Set env vars before any imports ──────────────────────────────────────
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// ── Mock Supabase module ──────────────────────────────────────────────────
// We mock the default export from config/supabase.js which is the client.
// jest.unstable_mockModule works with ESM.
let supabaseMock;

jest.unstable_mockModule('../config/supabase.js', () => {
  supabaseMock = {
    from: jest.fn(() => ({
      update: jest.fn(),
      select: jest.fn(),
      eq: jest.fn(),
      single: jest.fn(),
    })),
  };
  return { default: supabaseMock };
});

// Dynamic import AFTER mocking
const { updateUserProfile } = await import('../controllers/userController.js');

// ── Helpers ───────────────────────────────────────────────────────────────
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (body = {}, userId = 'supabase-uid-123') => ({
  user: { id: userId },
  body,
});

// ── Tests ─────────────────────────────────────────────────────────────────
describe('updateUserProfile controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: from() returns a fluent chain ending with single() resolving to updated user
    const chain = {
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'user-uuid-1',
          supabase_id: 'supabase-uid-123',
          full_name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '(555) 123-4567',
          bio: 'A short bio.',
          avatar_url: null,
          role: 'customer',
        },
        error: null,
      }),
    };
    supabaseMock.from = jest.fn().mockReturnValue(chain);
  });

  // ── Auth ────────────────────────────────────────────────────────────────

  test('returns 400 when req.user is not present', async () => {
    const req = { user: null, body: { full_name: 'Alice' } };
    const res = mockRes();
    await updateUserProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  // ── Validation ───────────────────────────────────────────────────────────

  test('returns 400 when full_name is too short', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: 'A' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toHaveProperty('full_name');
  });

  test('returns 400 when full_name is too long (>100 chars)', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: 'A'.repeat(101) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toHaveProperty('full_name');
  });

  test('returns 400 when full_name contains invalid characters', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: 'John123' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toHaveProperty('full_name');
  });

  test('returns 400 when phone format is invalid', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ phone: '123' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toHaveProperty('phone');
  });

  test('returns 400 when bio exceeds 500 characters', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ bio: 'x'.repeat(501) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toHaveProperty('bio');
  });

  test('returns 400 when no fields are provided', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── Successful updates ────────────────────────────────────────────────────

  test('returns 200 with updated user when full_name is valid', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: 'Jane Doe' }), res);
    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('full_name');
  });

  test('returns 200 when valid phone is provided', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ phone: '(555) 123-4567' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 200 when phone uses +1-XXX-XXX-XXXX format', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ phone: '+1-555-123-4567' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('accepts empty phone (clears the field)', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ phone: '' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 200 when valid bio is provided', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ bio: 'A short bio.' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('accepts bio of exactly 500 characters', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ bio: 'x'.repeat(500) }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  // ── DB error handling ─────────────────────────────────────────────────────

  test('returns 500 when Supabase update returns an error', async () => {
    // The controller awaits .from().update().eq() — no .single() on update chains.
    // eq() must return a Promise so the destructured { error } is visible.
    const errChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB failure' } }),
    };
    supabaseMock.from = jest.fn().mockReturnValue(errChain);

    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: 'Valid Name' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  test('returns 404 when Supabase returns no data and no error', async () => {
    // Call 1: coreData update succeeds (no error).
    // Call 2: re-fetch SELECT returns { data: null, error: null } → controller returns 404.
    const updateSuccessChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetchNullChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    supabaseMock.from = jest.fn()
      .mockReturnValueOnce(updateSuccessChain)
      .mockReturnValueOnce(fetchNullChain);

    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: 'Valid Name' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  test('trims whitespace from full_name before saving', async () => {
    const capturedUpdate = { data: null };
    const trimChain = {
      update: jest.fn((payload) => {
        capturedUpdate.data = payload;
        return trimChain;
      }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: '1', full_name: 'Trimmed Name', email: 'x@x.com', role: 'customer' },
        error: null,
      }),
    };
    supabaseMock.from = jest.fn().mockReturnValue(trimChain);

    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: '  Trimmed Name  ' }), res);
    expect(trimChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Trimmed Name' }),
    );
  });

  test('allows international letters in full_name (é, ñ, ü)', async () => {
    const res = mockRes();
    await updateUserProfile(mockReq({ full_name: 'José García' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});
