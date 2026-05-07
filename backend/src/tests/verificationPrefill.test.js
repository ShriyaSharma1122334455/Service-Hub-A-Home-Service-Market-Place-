/**
 * Tests for Bug-Fix-3:
 *   VER-PREFILL-01/02 — getPrefill must return date_of_birth from users.dob (Bug A)
 *   VER-UPLOAD-01     — uploadId 500 must not leak stack traces (Bug B-B2)
 *   VER-INSERT-01     — uploadId always INSERTs a new row, never UPSERTs
 *   VER-SELFIE-01     — uploadSelfie stores face_match_score from faceMatchResult.similarity
 *   VER-SELFIE-02     — uploadSelfie 500 body does not contain stack trace
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

const { getPrefill, uploadId, uploadSelfie } = await import('../controllers/verificationController.js');
const storageMock = await import('../services/supabaseVerificationStorage.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Chain factory: select/eq/order/limit all chain; single/maybeSingle are terminal promises.
// insert/update/upsert chain (not terminal) — use dedicated chain objects when terminal behavior is needed.
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

// ── VER-PREFILL-01/02 ────────────────────────────────────────────────────

describe('getPrefill — Bug A (DOB)', () => {
  test('VER-PREFILL-01: returns date_of_birth when users.dob is set', async () => {
    // getPrefill makes exactly ONE Supabase call (getInternalUser) after Bug A fix.
    const internalChain = makeChain({
      data: { id: 'uuid-1', full_name: 'Jane Doe', email: 'jane@test.com', phone: '555-0001', dob: '1990-03-15', role: 'provider' },
      error: null,
    });

    supabaseMock.from = jest.fn().mockReturnValueOnce(internalChain);

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
      data: { id: 'uuid-2', full_name: 'Bob', email: 'bob@test.com', phone: null, dob: null, role: 'provider' },
      error: null,
    });

    supabaseMock.from = jest.fn().mockReturnValueOnce(internalChain);

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

// ── VER-UPLOAD-01 ────────────────────────────────────────────────────────

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

// ── VER-INSERT-01 ────────────────────────────────────────────────────────

describe('uploadId — VER-INSERT-01 (always INSERT, never UPSERT)', () => {
  test('VER-INSERT-01: uploadId inserts a new row and does not call update or upsert', async () => {
    const usersChain = makeChain({
      data: { id: 'uuid-insert-test', full_name: 'Alice Smith', email: 'alice@test.com', phone: null, dob: null, role: 'provider' },
      error: null,
    });

    // verifications.insert() is the terminal call — must return a Promise directly.
    const verificationChain = {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };

    supabaseMock.from = jest.fn()
      .mockReturnValueOnce(usersChain)          // getInternalUser → users table
      .mockReturnValueOnce(verificationChain);  // verifications.insert()

    storageMock.uploadVerificationDocument.mockResolvedValue({ success: true, path: 'test/id.jpg' });
    storageMock.getSignedUrl.mockResolvedValue({ success: true, signedUrl: 'http://mock.url/id.jpg' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ extractedName: 'Alice Smith', status: 'verified' }),
    });

    const req = {
      user: { id: 'supabase-uid-insert' },
      file: { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), originalname: 'id.jpg' },
      body: { documentType: 'drivers_license' },
    };
    const res = mockRes();
    await uploadId(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(verificationChain.insert).toHaveBeenCalledTimes(1);
    expect(verificationChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'uuid-insert-test', verification_status: 'pending' })
    );
  });
});

// ── VER-SELFIE-01/02 ─────────────────────────────────────────────────────

describe('uploadSelfie — face_match_score and stack trace', () => {
  test('VER-SELFIE-01: face_match_score is stored from faceMatchResult.similarity', async () => {
    const usersChain = makeChain({
      data: { id: 'uuid-selfie-test', full_name: 'Carol Jones', email: 'carol@test.com', phone: null, dob: null, role: 'provider' },
      error: null,
    });

    // Lookup chain: select().eq().order().limit(1).maybeSingle() returns existing verification row.
    const verificationLookupChain = makeChain({
      data: { id: 'verif-row-1', id_document_url: 'test/id.jpg' },
      error: null,
    });

    // Update chain: update() chains; eq() is the terminal call.
    const verificationUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    supabaseMock.from = jest.fn()
      .mockReturnValueOnce(usersChain)               // getInternalUser → users table
      .mockReturnValueOnce(verificationLookupChain)  // verifications select (find existing row)
      .mockReturnValueOnce(verificationUpdateChain); // verifications update (store face match)

    storageMock.uploadVerificationDocument.mockResolvedValue({ success: true, path: 'test/selfie.jpg' });
    storageMock.getSignedUrl.mockResolvedValue({ success: true, signedUrl: 'http://mock.url/file.jpg' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ similarity: 92.5, matched: true, status: 'verified' }),
    });

    const req = {
      user: { id: 'supabase-uid-selfie' },
      file: { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), originalname: 'selfie.jpg' },
      body: {},
    };
    const res = mockRes();
    await uploadSelfie(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(verificationUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ face_match_score: 92.5 })
    );
  });

  test('VER-SELFIE-02: uploadSelfie 500 body does not contain stack trace', async () => {
    const dbErr = new Error('Selfie DB connection failed');
    dbErr.stack = 'Error: Selfie DB connection failed\n    at Object.<anonymous> (verificationController.js:200)';
    supabaseMock.from = jest.fn().mockImplementation(() => { throw dbErr; });

    const req = {
      user: { id: 'supabase-uid-selfie-err' },
      file: { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), originalname: 'selfie.jpg' },
      body: {},
    };
    const res = mockRes();
    await uploadSelfie(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/at Object\./);
    expect(serialised).not.toMatch(/Selfie DB connection failed/);
    expect(body.error).toBe('Failed to process selfie image. Please try again.');
  });
});
