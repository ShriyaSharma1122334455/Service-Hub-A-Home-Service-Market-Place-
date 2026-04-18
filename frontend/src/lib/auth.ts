  import { supabase } from "./supabase"

  export const signUpWithRole = async (
    email: string,
    password: string,
    role?: string,
    fullName?: string,
    phone?: string
  ) => {
    // store role in user_metadata (lowercase expected by backend)
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: role || 'customer',
          phone: phone || null,
          full_name: fullName || email.split("@")[0],
        },
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
