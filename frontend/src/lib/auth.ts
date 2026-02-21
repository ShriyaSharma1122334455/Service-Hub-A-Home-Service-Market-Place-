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
