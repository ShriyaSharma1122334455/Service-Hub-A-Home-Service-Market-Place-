import fetchApi from '../lib/api';
import type { ApiResponse } from '../lib/api';

export type BackendUser = {
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'failed';
  id: string;
  supabase_id: string;
  full_name: string;
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
  businessName: string;
  ratingAvg: number | undefined;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'failed';
  id: string;
  user_id?: string;
  supabase_id?: string;
  full_name?: string;
  business_name?: string;
  email?: string;
  avatarUrl?: string;
  role?: string;
  bio?: string;
  serviceCategory?: string;
  service_categories?: unknown[];
  hourlyRate?: number;
  rating?: number;
  rating_avg?: number;
  rating_count?: number;
  reviewCount?: number;
  is_fully_verified?: boolean;
  availabilityStatus?: string;
  description?: string;
};

export type GetMeResponse = (BackendUser & { type: 'user' }) | (BackendProvider & { type: 'provider' });

export const profileService = {
  async getUser(id: string): Promise<ApiResponse<BackendUser>> {
    return fetchApi<BackendUser>(`/user/${id}`);
  },

  async getMe(): Promise<ApiResponse<GetMeResponse>> {
    return fetchApi<GetMeResponse>('/users/me');
  },

  async listUsers(): Promise<ApiResponse<BackendUser[]>> {
    const res = await fetchApi<{ users: BackendUser[] }>('/users');
    if (!res.success) return { success: false, error: res.error };
    return { success: true, data: res.data?.users ?? [] };
  },

  async getProvider(id: string): Promise<ApiResponse<BackendProvider>> {
    return fetchApi<BackendProvider>(`/provider/${id}`);
  },

  async listProviders(): Promise<ApiResponse<BackendProvider[]>> {
    const res = await fetchApi<{ providers: BackendProvider[] }>('/providers');
    if (!res.success) return { success: false, error: res.error };
    return { success: true, data: res.data?.providers ?? [] };
  },
};
