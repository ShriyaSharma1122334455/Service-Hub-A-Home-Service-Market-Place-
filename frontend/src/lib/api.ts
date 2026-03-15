import { supabase } from "./supabase"
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TEST_TOKEN = 'test-token-for-development';

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

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
  const token = await getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TEST_TOKEN}`,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
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

export default fetchApi;
