import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabaseUrl      = process.env.SUPABASE_URL;
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey          = process.env.SUPABASE_ANON_KEY;

// In test mode without real credentials, skip validation and use a placeholder
// URL so Jest can import the module. Tests that hit real Supabase endpoints
// will be skipped/handled at the test level when secrets are absent.
const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  if (!supabaseUrl)    throw new Error('❌ Missing SUPABASE_URL in .env');
  if (!serviceRoleKey) throw new Error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  if (!anonKey)        throw new Error('❌ Missing SUPABASE_ANON_KEY in .env');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', serviceRoleKey || 'placeholder-key', {
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