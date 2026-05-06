import supabase from '../config/supabase.js';

/** Shown when auth exists but public.users row is missing (e.g. failed signup trigger). */
export const PROFILE_NOT_FOUND_MESSAGE =
  'Profile not found — please complete registration';

/**
 * Resolves public.users row from Supabase Auth user id.
 * @param {string} supabaseId - JWT subject / auth user id
 * @param {string} [select] - PostgREST select fragment (default id, role)
 * @returns {Promise<object|null>}
 */
export async function getInternalUser(supabaseId, select = 'id, role') {
  if (!supabaseId) return null;
  const { data, error } = await supabase
    .from('users')
    .select(select)
    .eq('supabase_id', supabaseId)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Creates public.users when Auth exists but the app row is missing (broken trigger, etc.).
 * @param {{ id: string, email?: string|null, role?: string, fullName?: string }} summary
 * @returns {Promise<boolean>} true if a row now exists or was inserted successfully
 */
export async function ensurePublicUserFromAuthSummary(summary) {
  const { id, email, role: rawRole, fullName } = summary || {};
  if (!id) return false;

  const existing = await getInternalUser(id);
  if (existing) return true;

  const role = ['customer', 'provider'].includes(String(rawRole || '').toLowerCase())
    ? String(rawRole).toLowerCase()
    : 'customer';

  const resolvedName =
    (typeof fullName === 'string' && fullName.trim())
    || (email ? String(email).split('@')[0] : 'User');

  const { error: upsertError } = await supabase.from('users').upsert(
    {
      supabase_id: id,
      email: email || '',
      full_name: resolvedName,
      role,
    },
    { onConflict: 'supabase_id' },
  );

  if (upsertError) {
    console.error('ensurePublicUserFromAuthSummary: upsert failed', upsertError);
    return false;
  }
  return true;
}

/** Standard JSON 404 for missing public.users profile. */
export function profileNotFoundResponse(res) {
  return res.status(404).json({
    success: false,
    error: PROFILE_NOT_FOUND_MESSAGE,
  });
}
