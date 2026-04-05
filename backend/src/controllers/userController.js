import supabase from '../config/supabase.js';

export const getMe = async (req, res) => {
  try {
    const supabaseId = req.user?.id;
    if (!supabaseId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required' });
    }

    // Get user from public.users
    const { data: user, error } = await supabase
      .from('users')
      .select('id, supabase_id, full_name, email, avatar_url, role, verification_status')
      .eq('supabase_id', supabaseId)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // If provider, fetch their profile too
    if (user.role === 'provider') {
      const { data: provider, error: providerError } = await supabase
        .from('providers')
        .select('id, business_name, description, rating_avg, rating_count, verification_status, provider_categories(category_id)')
        .eq('user_id', user.id)
        .single();

      if (providerError || !provider) {
        return res.status(404).json({ success: false, error: 'Provider profile not found' });
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
          service_categories: provider.provider_categories,
          full_name: user.full_name,
          email: user.email,
          avatar_url: user.avatar_url,
          role: user.role,
          verificationStatus: provider.verification_status || user.verification_status || 'unverified',
        }
      });
    }

    // Customer
    return res.json({
      success: true,
      data: { type: 'user', ...user, verificationStatus: user.verification_status || 'unverified' }
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
      .select('id, supabase_id, full_name, avatar_url, role, verification_status')
      .eq('id', id)  // id here is the public.users UUID, not supabase_id
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: { ...user, verificationStatus: user.verification_status || 'unverified' } });

  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

export const listUsers = async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, supabase_id, full_name, avatar_url, role, email, verification_status')
      .eq('role', 'customer');

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    const mappedUsers = users.map(u => ({ ...u, verificationStatus: u.verification_status || 'unverified' }));

    return res.json({ success: true, data: { users: mappedUsers } });

  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

export default { getMe, getUser, listUsers };