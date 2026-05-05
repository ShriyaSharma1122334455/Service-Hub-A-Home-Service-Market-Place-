import supabase from '../config/supabase.js';
import { PROFILE_NOT_FOUND_MESSAGE } from '../utils/internalUser.js';

// getMe

export const getMe = async (req, res) => {
  try {
    const supabaseId = req.user?.id;
    if (!supabaseId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required' });
    }

    // Step 1 — core columns that are guaranteed to exist
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

    // Step 2 — optional editable columns (phone, bio).
    // These may not exist if the DB migration hasn't been run yet.
    // Silently fall back to null so the main profile load never breaks.
    let phone = null;
    let bio = null;
    const { data: extras } = await supabase
      .from('users')
      .select('phone, bio')
      .eq('supabase_id', supabaseId)
      .single();
    if (extras) {
      phone = extras.phone ?? null;
      bio = extras.bio ?? null;
    }

    // provider is the first element of the joined array (or null if no row yet)
    const provider = user.providers?.[0] ?? null;

    if (user.role === 'provider') {
      if (!provider) {
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
            phone,
            bio,
            avatar_url: user.avatar_url,
            role: user.role,
            profile_incomplete: true,
          },
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
          phone,
          bio,
          avatar_url: user.avatar_url,
          role: user.role,
          verificationStatus: provider.verification_status || user.verification_status || 'unverified',
          profile_incomplete: false,
        },
      });
    }

    // Customer — spread core user fields then overlay phone/bio
    return res.json({
      success: true,
      data: { type: 'user', ...user, phone, bio, verificationStatus: user.verification_status || 'unverified' }
    });

  } catch (err) {
    console.error('Error fetching me:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

// getUser

export const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, supabase_id, full_name, avatar_url, role, verification_status')
      .eq('id', id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: { ...user, verificationStatus: user.verification_status || 'unverified' },
    });

  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

// listUsers

export const listUsers = async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, supabase_id, full_name, avatar_url, role, email, verification_status')
      .eq('role', 'customer');

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    const mappedUsers = users.map(u => ({
      ...u,
      verificationStatus: u.verification_status || 'unverified',
    }));

    return res.json({ success: true, data: { users: mappedUsers } });

  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

// updateUserRole

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
    if (role !== 'provider') {
      return res.status(400).json({ success: false, error: 'Invalid role transition' });
    }

    // Fetch current user to confirm they are a customer
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

    // Update public.users role
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ role: 'provider' })
      .eq('supabase_id', supabaseId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, error: updateError.message });
    }

    // Create providers row
    const { data: newProvider, error: providerError } = await supabase
      .from('providers')
      .insert({
        user_id:       currentUser.id,
        business_name: updatedUser.full_name || 'New Provider',
        description:   'Welcome to ServiceHub! Please complete your provider profile.',
        rating_avg:    0,
        rating_count:  0,
      })
      .select()
      .single();

    if (providerError) {
      // Rollback public.users role change on providers insert failure
      await supabase
        .from('users')
        .update({ role: 'customer' })
        .eq('supabase_id', supabaseId);

      return res.status(500).json({ success: false, error: 'Failed to create provider profile' });
    }

    // Sync Supabase auth metadata
    
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      supabaseId,
      { user_metadata: { role: 'provider' } },
    );

    if (authUpdateError) {
      
      console.error(
        'Warning: Failed to sync Supabase auth metadata after role upgrade:',
        authUpdateError.message,
      );
    }

    return res.json({
      success: true,
      requiresReauth: true,   // ← frontend must call supabase.auth.refreshSession()
      data: {
        type:          'provider',
        id:            newProvider.id,
        business_name: newProvider.business_name,
        description:   newProvider.description,
        rating_avg:    newProvider.rating_avg,
        rating_count:  newProvider.rating_count,
        service_categories: [],
        full_name:     updatedUser.full_name,
        email:         updatedUser.email,
        avatar_url:    updatedUser.avatar_url,
        role:          updatedUser.role,
        profile_incomplete: true,
      },
    });

  } catch (err) {
    console.error('Error updating user role:', err);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
};

// ── Validation helpers (server-side) ─────────────────────────────────────

const FULL_NAME_RE = /^[a-zA-ZÀ-ÿ\s'-]+$/;
const PHONE_RE = /^(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;

function validateProfileUpdate({ full_name, phone, bio }) {
  const errors = {};

  if (full_name !== undefined) {
    const name = String(full_name).trim();
    if (name.length < 2 || name.length > 100) {
      errors.full_name = 'Full name must be 2-100 characters';
    } else if (!FULL_NAME_RE.test(name)) {
      errors.full_name = 'Full name may only contain letters, spaces, hyphens, or apostrophes';
    }
  }

  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    if (!PHONE_RE.test(String(phone).trim())) {
      errors.phone = 'Phone must be in format (XXX) XXX-XXXX or +1-XXX-XXX-XXXX';
    }
  }

  if (bio !== undefined && bio !== null && String(bio).trim().length > 500) {
    errors.bio = 'Bio must not exceed 500 characters';
  }

  return errors;
}

export const updateUserProfile = async (req, res) => {
  try {
    const supabaseId = req.user?.id;
    if (!supabaseId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required' });
    }

    const { full_name, phone, bio } = req.body;

    const errors = validateProfileUpdate({ full_name, phone, bio });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors });
    }

    // Separate guaranteed columns from optional ones that require a migration
    const coreData = {};
    if (full_name !== undefined) coreData.full_name = String(full_name).trim();

    const extData = {};
    if (phone !== undefined) extData.phone = (phone === null || String(phone).trim() === '') ? null : String(phone).trim();
    if (bio   !== undefined) extData.bio   = (bio   === null || String(bio).trim()   === '') ? null : String(bio).trim();

    if (!Object.keys(coreData).length && !Object.keys(extData).length) {
      return res.status(400).json({ success: false, error: 'No fields provided to update' });
    }

    // Step 1 — update full_name (always-existing column)
    if (Object.keys(coreData).length) {
      const { error: coreErr } = await supabase
        .from('users')
        .update(coreData)
        .eq('supabase_id', supabaseId);

      if (coreErr) {
        console.error('Profile core update error:', coreErr);
        return res.status(500).json({ success: false, error: 'Failed to update profile' });
      }
    }

    // Step 2 — update phone/bio (optional columns that may not be migrated yet)
    let extColumnsMissing = false;
    if (Object.keys(extData).length) {
      const { error: extErr } = await supabase
        .from('users')
        .update(extData)
        .eq('supabase_id', supabaseId);

      if (extErr) {
        if (extErr.code === '42703') {
          // Column does not exist yet
          extColumnsMissing = true;
        } else {
          console.error('Profile extended update error:', extErr);
        }
      }
    }

    // If ONLY phone/bio were submitted and the columns are missing, return a clear migration error
    if (extColumnsMissing && !Object.keys(coreData).length) {
      return res.status(400).json({
        success: false,
        error: 'Phone and bio fields require a database migration. Run: ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20); ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;',
      });
    }

    // Fetch the updated row using only guaranteed columns for the response
    const { data: updatedUser, error: fetchErr } = await supabase
      .from('users')
      .select('id, supabase_id, full_name, email, avatar_url, role')
      .eq('supabase_id', supabaseId)
      .single();

    if (fetchErr) {
      return res.json({ success: true, message: 'Profile updated successfully', data: null });
    }

    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });

  } catch (err) {
    console.error('Error updating user profile:', err);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

export default { getMe, getUser, listUsers, updateUserRole, updateUserProfile };