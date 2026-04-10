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

/** Standard JSON 404 for missing public.users profile. */
export function profileNotFoundResponse(res) {
  return res.status(404).json({
    success: false,
    error: PROFILE_NOT_FOUND_MESSAGE,
  });
}
