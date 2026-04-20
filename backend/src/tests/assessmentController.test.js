/**
 * Tests for assessmentController.js
 *
 * Tests the exported handler directly with mock req/res objects.
 * Mocks: global.fetch (VDA HTTP call), file-type, catalogMatchmaking.
 * No real network calls are made.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Env vars must be set BEFORE any module is imported ────────────────────
process.env.VDA_SERVICE_URL = 'https://vda.test';
process.env.VDA_SERVICE_API_KEY = 'test-key-abc';
process.env.NODE_ENV = 'test';

// ── ESM mocks must be registered BEFORE the controller is imported ────────
const mockMatchAssessmentToCatalog = jest.fn();
await jest.unstable_mockModule('../services/catalogMatchmaking.js', () => ({
  matchAssessmentToCatalog: mockMatchAssessmentToCatalog,
  default: { matchAssessmentToCatalog: mockMatchAssessmentToCatalog },
}));

const mockFileTypeFromBuffer = jest.fn();
await jest.unstable_mockModule('file-type', () => ({
  fileTypeFromBuffer: mockFileTypeFromBuffer,
}));

// ── Dynamic import AFTER mocks are in place ───────────────────────────────
const { assessVisualDamage } = await import('../controllers/assessmentController.js');

// ── Helpers ───────────────────────────────────────────────────────────────
function makeFile({ size = 5000, mimetype = 'image/jpeg', buffer = Buffer.from('fake-img') } = {}) {
  return { size, mimetype, buffer };
}

function makeReq(overrides = {}) {
  return {
    file: 'file' in overrides ? overrides.file : makeFile(),
    body: overrides.body ?? {},
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/** Builds a minimal mock Response for the VDA fetch call. */
function makeVdaResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

const GOOD_VDA = {
  assessment: 'Wall has minor cracks.',
  recommendation: 'Patch and repaint.',
  estimated_cost_usd: '$150-$300',
  confidence_score: '88%',
};

const GOOD_CATALOG = {
  recommended_services: [
    { id: 'svc-1', name: 'Painting', description: null, base_price: 200, duration_minutes: 120, category: null },
  ],
};

// ── Env backup for tests that mutate process.env ──────────────────────────
const ENV_URL_KEY = 'VDA_SERVICE_URL';
const ENV_TOKEN_KEY = 'VDA_SERVICE_API_KEY';

beforeEach(() => {
  jest.clearAllMocks();
  process.env[ENV_URL_KEY] = 'https://vda.test';
  process.env[ENV_TOKEN_KEY] = 'test-key-abc';
  global.fetch = jest.fn();
  mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' });
  mockMatchAssessmentToCatalog.mockResolvedValue(GOOD_CATALOG);
});

// ═════════════════════════════════════════════════════════════════════════
// 1. Environment / config validation
// ═════════════════════════════════════════════════════════════════════════
describe('assessVisualDamage — config validation', () => {
  it('returns 503 when VDA_SERVICE_URL is not set', async () => {
    delete process.env[ENV_URL_KEY];
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  it('returns 503 when VDA_SERVICE_API_KEY is not set', async () => {
    delete process.env[ENV_TOKEN_KEY];
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 2. File validation
// ═════════════════════════════════════════════════════════════════════════
describe('assessVisualDamage — file validation', () => {
  it('returns 400 when no file is uploaded', async () => {
    const res = makeRes();
    await assessVisualDamage(makeReq({ file: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when file exceeds 10 MB', async () => {
    const res = makeRes();
    await assessVisualDamage(makeReq({ file: makeFile({ size: 11 * 1024 * 1024 }) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for unsupported MIME type (image/gif)', async () => {
    const res = makeRes();
    await assessVisualDamage(makeReq({ file: makeFile({ mimetype: 'image/gif' }) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when magic bytes do not match declared MIME', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/octet-stream' });
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when fileTypeFromBuffer throws', async () => {
    mockFileTypeFromBuffer.mockRejectedValue(new Error('Parse error'));
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when task description is too long', async () => {
    const res = makeRes();
    global.fetch = jest.fn().mockResolvedValue(makeVdaResponse(GOOD_VDA));
    await assessVisualDamage(makeReq({ body: { task: 'x'.repeat(600) } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 3. VDA fetch failures
// ═════════════════════════════════════════════════════════════════════════
describe('assessVisualDamage — VDA fetch failures', () => {
  it('returns 504 when VDA request times out (AbortError)', async () => {
    const abortErr = Object.assign(new Error('Request aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abortErr);
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(504);
  });

  it('returns 500 when VDA fetch throws a non-abort network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 502 when VDA response body is not valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('not json at all'),
    });
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('returns 4xx when VDA returns a 4xx error response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      makeVdaResponse({ detail: 'Invalid file' }, { ok: false, status: 400 }),
    );
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  it('returns 5xx when VDA returns a 5xx error response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      makeVdaResponse({ detail: 'Internal server error' }, { ok: false, status: 500 }),
    );
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect([500, 502]).toContain(res.status.mock.calls[0][0]);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 4. Success path
// ═════════════════════════════════════════════════════════════════════════
describe('assessVisualDamage — success', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(makeVdaResponse(GOOD_VDA));
  });

  it('returns 200 with vda data and recommended_services', async () => {
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);

    expect(res.status).not.toHaveBeenCalled(); // default 200
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.vda.assessment).toBe(GOOD_VDA.assessment);
    expect(body.data.vda.recommendation).toBe(GOOD_VDA.recommendation);
    expect(body.data.vda.confidence_score).toBe(GOOD_VDA.confidence_score);
    expect(body.data.recommended_services).toEqual(GOOD_CATALOG.recommended_services);
    expect(body.data.quote).toBeDefined();
    expect(typeof body.data.quote.recommended_usd).toBe('number');
    expect(typeof body.data.quote.fair_min_usd).toBe('number');
    expect(typeof body.data.quote.ceiling_usd).toBe('number');
  });

  it('includes job_description in the response', async () => {
    const res = makeRes();
    await assessVisualDamage(makeReq(), res);
    expect(res.json.mock.calls[0][0].data.job_description).toContain(GOOD_VDA.assessment);
    expect(res.json.mock.calls[0][0].data.job_description).toContain('Negotiation price guidance');
  });

  it('uses a default task when none is provided in the request body', async () => {
    const res = makeRes();
    await assessVisualDamage(makeReq({ body: {} }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('accepts PNG files as well as JPEG', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' });
    const res = makeRes();
    await assessVisualDamage(makeReq({ file: makeFile({ mimetype: 'image/png' }) }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('forwards a custom task string to the VDA service', async () => {
    const res = makeRes();
    await assessVisualDamage(makeReq({ body: { task: 'Check for water damage' } }), res);

    const fetchCall = global.fetch.mock.calls[0];
    const formData = fetchCall[1].body;
    // FormData.get is available on the Node 18 FormData implementation
    expect(formData.get('task')).toBe('Check for water damage');
  });

  it('decodes escaped punctuation for client-facing vda text', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      makeVdaResponse({
        assessment: 'Contractor said &quot;quick fix&quot; is enough.',
        recommendation: 'Ask for a &#x27;finished&#x27; quote.',
        estimated_cost_usd: '$100-$200',
        confidence_score: '0.92',
      }),
    );

    const res = makeRes();
    await assessVisualDamage(makeReq(), res);

    const payload = res.json.mock.calls[0][0].data;
    expect(payload.vda.assessment).toContain('"quick fix"');
    expect(payload.vda.recommendation).toContain("'finished'");
    expect(payload.vda.recommendation).not.toContain('&#x27;');
    expect(payload.job_description).toContain("'finished'");
  });
});
