/**
 * Tests for Bug-Fix-3:
 *   VER-PREFILL-01/02 — getPrefill must return date_of_birth from users.dob (Bug A)
 *   VER-UPLOAD-01     — uploadId 500 must not leak stack traces (Bug B-B2)
 */

import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.AI_SERVICES_URL = 'http://localhost:8000';
process.env.AI_INTERNAL_API_KEY = 'test-key';

let supabaseMock;

jest.unstable_mockModule('../config/supabase.js', () => {
  supabaseMock = { from: jest.fn() };
  return { default: supabaseMock };
});

jest.unstable_mockModule('../services/supabaseVerificationStorage.js', () => ({
  uploadVerificationDocument: jest.fn(),
  generateVerificationPath: jest.fn().mockReturnValue('test/path.jpg'),
  getSignedUrl: jest.fn(),
}));

const { getPrefill, uploadId } = await import('../controllers/verificationController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeChain = (resolveWith) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(resolveWith),
  single: jest.fn().mockResolvedValue(resolveWith),
});

describe('getPrefill — Bug A (DOB)', () => {
  test('VER-PREFILL-01: returns date_of_birth when users.dob is set', async () => {
    const internalChain = makeChain({
      data: { id: 'uuid-1', full_name: 'Jane Doe', email: 'jane@test.com', phone: '555-0001', role: 'provider' },
      error: null,
    });
    const prefillChain = makeChain({
      data: { full_name: 'Jane Doe', email: 'jane@test.com', phone: '555-0001', dob: '1990-03-15' },
      error: null,
    });

    supabaseMock.from = jest.fn()
      .mockReturnValueOnce(internalChain)
      .mockReturnValueOnce(prefillChain);

    const res = mockRes();
    await getPrefill({ user: { id: 'supabase-uid' } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ date_of_birth: '1990-03-15' }),
      })
    );
  });

  test('VER-PREFILL-02: returns null date_of_birth when dob is null in DB', async () => {
    const internalChain = makeChain({
      data: { id: 'uuid-2', full_name: 'Bob', email: 'bob@test.com', phone: null, role: 'provider' },
      error: null,
    });
    const prefillChain = makeChain({
      data: { full_name: 'Bob', email: 'bob@test.com', phone: null, dob: null },
      error: null,
    });

    supabaseMock.from = jest.fn()
      .mockReturnValueOnce(internalChain)
      .mockReturnValueOnce(prefillChain);

    const res = mockRes();
    await getPrefill({ user: { id: 'supabase-uid-2' } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ date_of_birth: null }),
      })
    );
  });
});

describe('uploadId — Bug B-B2 (no stack trace leak)', () => {
  test('VER-UPLOAD-01: 500 body does not contain stack trace or raw error message', async () => {
    const dbErr = new Error('DB connection failed');
    dbErr.stack = 'Error: DB connection failed\n    at Object.<anonymous> (verificationController.js:30)';
    supabaseMock.from = jest.fn().mockImplementation(() => { throw dbErr; });

    const req = {
      user: { id: 'supabase-uid' },
      file: { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), originalname: 'id.jpg' },
      body: { documentType: 'drivers_license' },
    };
    const res = mockRes();
    await uploadId(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/at Object\./);
    expect(serialised).not.toMatch(/DB connection failed/);
    expect(body.error).toBe('Failed to process ID document. Please try again.');
  });
});
