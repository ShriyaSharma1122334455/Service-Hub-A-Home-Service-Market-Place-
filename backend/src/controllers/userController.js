import supabase from '../config/supabase.js';
import { PROFILE_NOT_FOUND_MESSAGE } from '../utils/internalUser.js';

export const getMe = async (req, res) => {
  try {
    const supabaseId = req.user?.id;
    if (!supabaseId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required' });
    }

    // Fetch user from public.users, joining providers in the same query
    // Left join means we get the user row even if no provider row exists yet
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id,
        supabase_id,
        full_name,
        email,
        avatar_url,
        role,
        providers (
          id,
          business_name,
          description,
          rating_avg,
          rating_count,
          provider_categories ( category_id )
        )
      `)
      .eq('supabase_id', supabaseId)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: PROFILE_NOT_FOUND_MESSAGE });
    }

    // provider is the first element of the joined array (or null if no row yet)
    const provider = user.providers?.[0] ?? null;

    if (user.role === 'provider') {
      if (!provider) {
        // Provider account exists in public.users but no providers row yet.
        // Return the user data with type: 'provider' and empty provider fields.
        // This happens on first login before an onboarding flow creates the row.
        return res.json({
          success: true,
          data: {
            type: 'provider',
            id: null,
            business_name: null,
            description: null,
            rating_avg: null,
            rating_count: null,
            service_categories: [],
            full_name: user.full_name,
            email: user.email,
            avatar_url: user.avatar_url,
            role: user.role,
            profile_incomplete: true,
          }
        });
      }

      return res.json({
        success: true,
        data: {
          type: 'provider',
          id: provider.id,
          business_name: provider.business_name,
          description: provider.description,
          rating_avg: provider.rating_avg,
          rating_count: provider.rating_count,
          service_categories: provider.provider_categories ?? [],
          full_name: user.full_name,
          email: user.email,
          avatar_url: user.avatar_url,
          role: user.role,
          profile_incomplete: false,
        }
      });
    }

    // Customer — no provider join needed
    return res.json({
      success: true,
      data: { type: 'user', ...user, providers: undefined }
    });

  } catch (err) {
    console.error('Error fetching me:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

export const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, supabase_id, full_name, avatar_url, role')
      .eq('id', id)  // id here is the public.users UUID, not supabase_id
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user });

  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

export const listUsers = async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, supabase_id, full_name, avatar_url, role, email')
      .eq('role', 'customer');

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.json({ success: true, data: { users } });

  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

export default { getMe, getUser, listUsers };