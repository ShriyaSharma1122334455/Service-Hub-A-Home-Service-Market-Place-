/**
 * Unit tests for searchService
 * Mocks the global fetch to test URL construction and response handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchService } from '../services/search';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockFetch = (body: unknown, ok = true, status = 200) => {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
};

const captureUrl = (fetchMock: ReturnType<typeof vi.fn>) => {
  const call = fetchMock.mock.calls[0];
  return call?.[0] as string;
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── searchProviders ──────────────────────────────────────────────────────────

describe('searchService.searchProviders', () => {
  it('calls the correct endpoint with no params', async () => {
    const fetch = mockFetch({ success: true, data: { providers: [] }, count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchProviders({});

    const url = captureUrl(fetch);
    expect(url).toContain('/providers/search');
    expect(url).not.toContain('search=');
    expect(url).not.toContain('location=');
  });

  it('appends keyword as search param', async () => {
    const fetch = mockFetch({ success: true, data: { providers: [] }, count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchProviders({ keyword: 'plumber' });

    const url = captureUrl(fetch);
    expect(url).toContain('search=plumber');
  });

  it('appends location param', async () => {
    const fetch = mockFetch({ success: true, data: { providers: [] }, count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchProviders({ location: 'New York' });

    const url = captureUrl(fetch);
    expect(url).toContain('location=New+York');
  });

  it('appends category param', async () => {
    const fetch = mockFetch({ success: true, data: { providers: [] }, count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchProviders({ category: 'abc123' });

    const url = captureUrl(fetch);
    expect(url).toContain('category=abc123');
  });

  it('combines multiple params', async () => {
    const fetch = mockFetch({ success: true, data: { providers: [] }, count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchProviders({ keyword: 'fix', location: 'LA', category: 'plumb' });

    const url = captureUrl(fetch);
    expect(url).toContain('search=fix');
    expect(url).toContain('location=LA');
    expect(url).toContain('category=plumb');
  });

  it('returns success with providers array on 200', async () => {
    const providers = [{ _id: '1', businessName: 'AquaFix', location: 'NY' }];
    const fetch = mockFetch({ success: true, data: { providers }, count: 1, total: 1, page: 1 });
    vi.stubGlobal('fetch', fetch);

    const result = await searchService.searchProviders({ keyword: 'aqua' });

    expect(result.success).toBe(true);
    expect(result.data?.providers).toHaveLength(1);
    expect(result.data?.providers[0].businessName).toBe('AquaFix');
  });

  it('returns success:false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const result = await searchService.searchProviders({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network failure');
  });

  it('returns success:false on non-ok HTTP response', async () => {
    const fetch = mockFetch({ error: 'Server error' }, false, 500);
    vi.stubGlobal('fetch', fetch);

    const result = await searchService.searchProviders({});

    expect(result.success).toBe(false);
  });

  it('omits empty string params from query string', async () => {
    const fetch = mockFetch({ success: true, data: { providers: [] }, count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchProviders({ keyword: '', location: '', category: '' });

    const url = captureUrl(fetch);
    expect(url).not.toContain('search=');
    expect(url).not.toContain('location=');
    expect(url).not.toContain('category=');
  });
});

// ─── searchServices ───────────────────────────────────────────────────────────

describe('searchService.searchServices', () => {
  it('calls the correct endpoint', async () => {
    const fetch = mockFetch({ success: true, data: [], count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchServices({});

    const url = captureUrl(fetch);
    expect(url).toContain('/services');
  });

  it('appends keyword as search param', async () => {
    const fetch = mockFetch({ success: true, data: [], count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchServices({ keyword: 'drain' });

    const url = captureUrl(fetch);
    expect(url).toContain('search=drain');
  });

  it('appends location param', async () => {
    const fetch = mockFetch({ success: true, data: [], count: 0, total: 0, page: 1 });
    vi.stubGlobal('fetch', fetch);

    await searchService.searchServices({ location: 'Brooklyn' });

    const url = captureUrl(fetch);
    expect(url).toContain('location=Brooklyn');
  });

  it('returns success with services array on 200', async () => {
    const services = [{ _id: 's1', name: 'Pipe Repair', basePrice: 150 }];
    const fetch = mockFetch({ success: true, data: services, count: 1, total: 1, page: 1 });
    vi.stubGlobal('fetch', fetch);

    const result = await searchService.searchServices({ keyword: 'pipe' });

    expect(result.success).toBe(true);
    expect(result.data?.services).toHaveLength(1);
    expect(result.data?.services[0].name).toBe('Pipe Repair');
  });

  it('returns success:false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const result = await searchService.searchServices({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });
});
