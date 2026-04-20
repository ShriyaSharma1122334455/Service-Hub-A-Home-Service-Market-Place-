/**
 * Tests for catalogMatchmaking.js
 *
 * Mocks: supabase config (DB queries), global.fetch (Gemini API).
 * No real network or database calls are made.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

process.env.NODE_ENV = 'test';

// ── Mock Supabase before the service module is imported ───────────────────
const mockLimit = jest.fn();
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        limit: mockLimit,
      })),
    })),
  })),
};

await jest.unstable_mockModule('../config/supabase.js', () => ({
  default: mockSupabase,
  checkSupabaseConnection: jest.fn(),
}));

const { matchAssessmentToCatalog, MAX_RECOMMENDED_SERVICES } =
  await import('../services/catalogMatchmaking.js');

// ── Sample catalog rows ────────────────────────────────────────────────────
const ROWS = [
  {
    id: '1',
    name: 'Pipe Repair',
    description: 'Fix leaking pipes and drains',
    base_price: 150,
    duration_minutes: 90,
    category: { slug: 'plumbing', name: 'Plumbing' },
    is_active: true,
  },
  {
    id: '2',
    name: 'Interior Painting',
    description: 'Wall and ceiling painting service',
    base_price: 300,
    duration_minutes: 240,
    category: { slug: 'painting', name: 'Painting' },
    is_active: true,
  },
  {
    id: '3',
    name: 'Electrical Panel Repair',
    description: 'Breaker and wiring repairs',
    base_price: 250,
    duration_minutes: 120,
    category: { slug: 'electrical', name: 'Electrical' },
    is_active: true,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

// ═════════════════════════════════════════════════════════════════════════
// 1. Supabase error handling
// ═════════════════════════════════════════════════════════════════════════
describe('matchAssessmentToCatalog — Supabase failures', () => {
  it('returns empty list when Supabase returns an error', async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: 'DB connection refused' } });
    const result = await matchAssessmentToCatalog({ assessment: 'leak', recommendation: 'fix' });
    expect(result.recommended_services).toEqual([]);
  });

  it('returns empty list when catalog has no active services', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    const result = await matchAssessmentToCatalog({ assessment: 'damage' });
    expect(result.recommended_services).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 2. Heuristic path (no GEMINI_API_KEY / GOOGLE_API_KEY)
// ═════════════════════════════════════════════════════════════════════════
describe('matchAssessmentToCatalog — heuristic ranking', () => {
  beforeEach(() => {
    mockLimit.mockResolvedValue({ data: ROWS, error: null });
  });

  it('returns at most MAX_RECOMMENDED_SERVICES results', async () => {
    const result = await matchAssessmentToCatalog({ assessment: 'general damage' });
    expect(result.recommended_services.length).toBeLessThanOrEqual(MAX_RECOMMENDED_SERVICES);
  });

  it('returns plumbing service for a leak/drain assessment', async () => {
    const result = await matchAssessmentToCatalog(
      { assessment: 'pipe is leaking under the sink', recommendation: 'fix the drain' },
      'plumbing problem',
    );
    const names = result.recommended_services.map((s) => s.name);
    expect(names).toContain('Pipe Repair');
  });

  it('returns electrical service for a wiring/breaker assessment', async () => {
    const result = await matchAssessmentToCatalog(
      { assessment: 'electrical wiring is damaged', recommendation: 'check the breaker' },
    );
    const names = result.recommended_services.map((s) => s.name);
    expect(names).toContain('Electrical Panel Repair');
  });

  it('returned services have the expected shape', async () => {
    const result = await matchAssessmentToCatalog({ assessment: 'crack in wall' });
    const svc = result.recommended_services[0];
    expect(svc).toHaveProperty('id');
    expect(svc).toHaveProperty('name');
    expect(typeof svc.base_price).toBe('number');
    expect(typeof svc.duration_minutes).toBe('number');
  });

  it('does not call global.fetch when Gemini key is absent', async () => {
    await matchAssessmentToCatalog({ assessment: 'any damage' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 3. AI ranking path (Gemini key set)
// ═════════════════════════════════════════════════════════════════════════
describe('matchAssessmentToCatalog — AI ranking', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    mockLimit.mockResolvedValue({ data: ROWS, error: null });
  });

  it('uses AI-ranked IDs when Gemma returns a valid response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '{"service_ids":["1"]}' }] } }],
      }),
      text: jest.fn().mockResolvedValue(''),
    });

    const result = await matchAssessmentToCatalog(
      { assessment: 'pipe is leaking', recommendation: 'repair pipes' },
      'plumbing',
    );

    expect(result.recommended_services[0].id).toBe('1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to heuristics when Gemma fetch throws a network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await matchAssessmentToCatalog(
      { assessment: 'pipe is leaking', recommendation: 'repair' },
      'plumbing',
    );

    expect(result.recommended_services.length).toBeGreaterThan(0);
  });

  it('falls back to heuristics when Gemma returns an HTTP error (429)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('Rate limit exceeded'),
    });

    const result = await matchAssessmentToCatalog({ assessment: 'leaking pipe' });
    expect(result.recommended_services.length).toBeGreaterThan(0);
  });

  it('falls back to heuristics when Gemma response JSON is unparseable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'not valid json' }] } }],
      }),
      text: jest.fn().mockResolvedValue(''),
    });

    const result = await matchAssessmentToCatalog({ assessment: 'leaking pipe' });
    expect(result.recommended_services.length).toBeGreaterThan(0);
  });

  it('falls back to heuristics when Gemma returns empty service_ids', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '{"service_ids":[]}' }] } }],
      }),
      text: jest.fn().mockResolvedValue(''),
    });

    const result = await matchAssessmentToCatalog(
      { assessment: 'pipe leak', recommendation: 'fix' },
      'plumbing',
    );
    expect(result.recommended_services.length).toBeGreaterThan(0);
  });

  it('strips markdown fences from Gemma response before parsing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '```json\n{"service_ids":["3"]}\n```' }] } }],
      }),
      text: jest.fn().mockResolvedValue(''),
    });

    const result = await matchAssessmentToCatalog(
      { assessment: 'electrical damage', recommendation: 'rewire' },
    );
    expect(result.recommended_services[0].id).toBe('3');
  });
});
