import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabaseUrl      = process.env.SUPABASE_URL;
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl)    throw new Error('❌ Missing SUPABASE_URL in .env');
if (!serviceRoleKey) throw new Error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env');
// SUPABASE_ANON_KEY is only needed by the frontend client; the backend uses the service role key.

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,    // backend has no session to persist
    autoRefreshToken: false,  // no token refresh needed server-side
  }
});

// ── Health check function ─────────────────────────────────────────────────
// Call this on server startup to verify Supabase is reachable
export const checkSupabaseConnection = async () => {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    console.log('✅ Supabase connected successfully');
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
    process.exit(1); // same behaviour as your old MongoDB connectDB
  }
};

export default supabase;