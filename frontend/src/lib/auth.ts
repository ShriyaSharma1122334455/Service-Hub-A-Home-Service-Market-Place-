import { supabase } from "./supabase"

export const signUp = async (
  email: string,
  password: string
) => {
  return supabase.auth.signUp({
    email,
    password,
  })
}

export const signUpWithRole = async (
  email: string,
  password: string,
  role?: string
) => {
  // store role in user_metadata (lowercase expected by backend)
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role: role || 'customer' },
    },
  });
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
