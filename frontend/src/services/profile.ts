import fetchApi from '../lib/api';
import type { ApiResponse } from '../lib/api';

export type BackendUser = {
  _id: string;
  supabaseId: string;
  fullName: string;
  email?: string;
  avatarUrl?: string;
  role: string;
  bio?: string;
  provider?: {
    services?: Array<{
      category: string;
      price: number;
      description: string;
    }>;
    rating?: number;
  };
};

export type BackendProvider = {
  _id: string;
  userId?: string;
  supabaseId?: string;
  fullName?: string;
  businessName?: string;
  email?: string;
  avatarUrl?: string;
  role?: string;
  bio?: string;
  serviceCategory?: string;
  serviceCategories?: unknown[];
  hourlyRate?: number;
  rating?: number;
  ratingAvg?: number;
  ratingCount?: number;
  reviewCount?: number;
  verified?: boolean;
  availabilityStatus?: string;
  description?: string;
};

export type GetMeResponse = (BackendUser & { type: 'user' }) | (BackendProvider & { type: 'provider' });

export const profileService = {
  async getUser(id: string): Promise<ApiResponse<BackendUser>> {
    return fetchApi<BackendUser>(`/profile/user/${id}`);
  },

  async getMe(email: string): Promise<ApiResponse<GetMeResponse>> {
    return fetchApi<GetMeResponse>('/profile/me', {
      headers: { 'X-User-Email': email },
    });
  },

  async listUsers(): Promise<ApiResponse<BackendUser[]>> {
    const res = await fetchApi<{ users: BackendUser[] }>('/profile/users');
    if (!res.success) return { success: false, error: res.error };
    return { success: true, data: res.data?.users ?? [] };
  },

  async getProvider(id: string): Promise<ApiResponse<BackendProvider>> {
    return fetchApi<BackendProvider>(`/profile/provider/${id}`);
  },

  async listProviders(): Promise<ApiResponse<BackendProvider[]>> {
    const res = await fetchApi<{ providers: BackendProvider[] }>('/profile/providers');
    if (!res.success) return { success: false, error: res.error };
    return { success: true, data: res.data?.providers ?? [] };
  },
};
