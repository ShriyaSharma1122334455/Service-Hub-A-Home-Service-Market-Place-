import { supabase } from "./supabase"

export const signUpWithRole = async (
  email: string,
  password: string,
  role?: string,
  fullName?: string,
  phone?: string,
  street?: string,
  city?: string,
  state?: string,
  zip?: string
) => {
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        role: role || 'customer',
        fullName: fullName || email.split("@")[0],
        phone,
        street,
        city,
        state,
        zip
      })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { data: null, error: new Error(json.message || "Registration failed") };
    }
    return { data: json.data, error: null };
  } catch (err: unknown) {
    return { data: null, error: err };
  }
}

export const signIn = async (
  email: string,
  password: string
) => {
  return supabase.auth.signInWithPassword({
    email,
    password,
  })
 }
 export const signOut = async () => {
  return supabase.auth.signOut()
}
