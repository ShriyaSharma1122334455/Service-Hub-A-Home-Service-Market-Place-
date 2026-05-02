import { supabase } from "./supabase"

export const signUpWithRole = async (
  email: string,
  password: string,
  role?: string,
  fullName?: string,
  phone?: string
) => {
  void phone;

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
    const response = await fetch(`${apiBase}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        fullName: fullName || email.split("@")[0],
        role: role || "customer",
      }),
    });

    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.success) {
      return {
        data: null,
        error: {
          message: json?.error || "Registration failed",
        },
      };
    }

    return {
      data: {
        user: json.data?.user || null,
        session: json.data?.token
          ? { access_token: json.data.token }
          : null,
        emailConfirmationRequired:
          json.data?.emailConfirmationRequired === true,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        message:
          err instanceof Error
            ? err.message
            : "Registration failed. Please try again.",
      },
    };
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
