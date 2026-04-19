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
          verificationStatus: provider.verification_status || user.verification_status || 'unverified',
          profile_incomplete: false,
        }
      });
    }

    // Customer — no provider join needed
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

export const updateUserRole = async (req, res) => {
  try {
    const supabaseId = req.user?.id;
    if (!supabaseId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required' });
    }

    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, error: 'Role is required' });
    }

    // Only allow upgrading from customer to provider
    if (role !== 'provider') {
      return res.status(400).json({ success: false, error: 'Invalid role transition' });
    }

    // Get current user to check current role
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('id, role')
      .eq('supabase_id', supabaseId)
      .single();

    if (fetchError || !currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (currentUser.role !== 'customer') {
      return res.status(400).json({ success: false, error: 'Only customers can become providers' });
    }

    // Update user role
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ role: 'provider' })
      .eq('supabase_id', supabaseId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, error: updateError.message });
    }

    // Create provider profile
    const { data: newProvider, error: providerError } = await supabase
      .from('providers')
      .insert({
        user_id: currentUser.id,
        business_name: updatedUser.full_name || 'New Provider',
        description: 'Welcome to ServiceHub! Please complete your provider profile.',
        rating_avg: 0,
        rating_count: 0
      })
      .select()
      .single();

    if (providerError) {
      // If provider creation fails, rollback user role change
      await supabase
        .from('users')
        .update({ role: 'customer' })
        .eq('supabase_id', supabaseId);

      return res.status(500).json({ success: false, error: 'Failed to create provider profile' });
    }

    // Return updated user data with provider info
    return res.json({
      success: true,
      data: {
        type: 'provider',
        id: newProvider.id,
        business_name: newProvider.business_name,
        description: newProvider.description,
        rating_avg: newProvider.rating_avg,
        rating_count: newProvider.rating_count,
        service_categories: [],
        full_name: updatedUser.full_name,
        email: updatedUser.email,
        avatar_url: updatedUser.avatar_url,
        role: updatedUser.role,
        profile_incomplete: true,
      }
    });

  } catch (err) {
    console.error('Error updating user role:', err);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
};

export default { getMe, getUser, listUsers, updateUserRole };