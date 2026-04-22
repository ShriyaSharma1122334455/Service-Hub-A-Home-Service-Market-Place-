import { supabase } from './supabase';

const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api`;

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Get the current Supabase session token dynamically.
  // supabase.auth.getSession() automatically refreshes the access token
  // when it is expired, so we always get a valid (or null) token here.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    // Only add Authorization if we actually have a token
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    // Caller-supplied headers override the defaults (e.g. X-User-Email)
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP error ${response.status}`,
      };
    }

    return {
      success: true,
      data: data.data || data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * POST multipart/form-data (e.g. visual assessment). Does not set Content-Type
 * so the browser sets the boundary automatically.
 */
export async function postFormData<T>(endpoint: string, formData: FormData) {
  const url = `${API_BASE_URL}${endpoint}`;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const body = data as { error?: string; message?: string };
      return {
        success: false as const,
        error:
          body.error ||
          body.message ||
          `HTTP error ${response.status}`,
      };
    }

    const payload = data as { success?: boolean; data?: T };
    return {
      success: true as const,
      data: (payload.data ?? data) as T,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export default fetchApi;
