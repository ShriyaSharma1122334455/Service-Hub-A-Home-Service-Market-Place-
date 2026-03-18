import fetchApi from '../lib/api';
import type { ApiResponse } from '../lib/api';
import type { BackendProvider } from './profile';

// ─── Param types ──────────────────────────────────────────────────────────────

export interface SearchProvidersParams {
  keyword?: string;
  category?: string;
  location?: string;
  minRating?: number;
  page?: number;
  limit?: number;
}

export interface SearchServicesParams {
  keyword?: string;
  category?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface BackendService {
  _id: string;
  providerId: string;
  categoryId: string | { _id: string; name: string };
  name: string;
  description: string;
  basePrice: number;
  durationMinutes: number;
  location?: string;
  isActive: boolean;
}

export interface SearchProvidersResult {
  providers: BackendProvider[];
  total: number;
  page: number;
  count: number;
}

export interface SearchServicesResult {
  services: BackendService[];
  total: number;
  page: number;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') qs.set(key, String(val));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const searchService = {
  /**
   * Search providers by keyword, category, and/or location.
   * Maps to GET /api/providers/search
   */
  async searchProviders(
    params: SearchProvidersParams
  ): Promise<ApiResponse<SearchProvidersResult>> {
    const query = buildQuery({
      search: params.keyword,
      category: params.category,
      location: params.location,
      minRating: params.minRating,
      page: params.page,
      limit: params.limit,
    });

    // API returns: { success, count, total, page, data: { providers: [...] } }
    // fetchApi unwraps to data.data → { providers: [...] }
    const res = await fetchApi<{ providers: BackendProvider[]; total?: number; page?: number; count?: number }>(
      `/providers/search${query}`
    );

    if (!res.success) return { success: false, error: res.error };

    return {
      success: true,
      data: {
        providers: res.data?.providers ?? [],
        total: res.data?.total ?? 0,
        page: res.data?.page ?? 1,
        count: res.data?.count ?? 0,
      },
    };
  },

  /**
   * Search services by keyword, category, and/or location.
   * Maps to GET /api/services
   */
  async searchServices(
    params: SearchServicesParams
  ): Promise<ApiResponse<SearchServicesResult>> {
    const query = buildQuery({
      search: params.keyword,
      category: params.category,
      location: params.location,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      page: params.page,
      limit: params.limit,
    });

    // API returns: { success, count, total, page, data: [...] }
    // fetchApi unwraps to data.data → [...]
    const res = await fetchApi<BackendService[]>(`/services${query}`);

    if (!res.success) return { success: false, error: res.error };

    return {
      success: true,
      data: {
        services: Array.isArray(res.data) ? res.data : [],
        total: 0,
        page: 1,
        count: Array.isArray(res.data) ? res.data.length : 0,
      },
    };
  },
};
