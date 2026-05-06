import supabase from '../config/supabase.js';
import { ensurePublicUserFromAuthSummary } from '../utils/internalUser.js';

const REGISTER_USER_WAIT_RETRIES = 6;
const REGISTER_USER_WAIT_MS = 300;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeProviderMeta(rawMeta, fullName) {
  if (!rawMeta || typeof rawMeta !== 'object') {
    return {
      businessName: fullName.trim(),
      description: 'Welcome to ServiceHub! Please complete your provider profile.',
      services: [],
    };
  }

  const businessName = String(rawMeta.businessName || fullName || '')
    .trim()
    .slice(0, 160);
  const description = String(
    rawMeta.description || 'Welcome to ServiceHub! Please complete your provider profile.',
  )
    .trim()
    .slice(0, 500);

  const services = Array.isArray(rawMeta.services)
    ? rawMeta.services
      .map((svc) => ({
        category: String(svc?.category || '').trim(),
        description: String(svc?.description || '').trim(),
        price: Number(svc?.price),
      }))
      .filter((svc) => svc.category && svc.description && Number.isFinite(svc.price) && svc.price > 0)
    : [];

  return {
    businessName: businessName || fullName.trim(),
    description,
    services,
  };
}

async function waitForPublicUser(supabaseUserId) {
  for (let attempt = 0; attempt < REGISTER_USER_WAIT_RETRIES; attempt += 1) {
    // Sequential polling is intentional to allow trigger propagation between attempts.
    // eslint-disable-next-line no-await-in-loop
    const { data: publicUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_id', supabaseUserId)
      .maybeSingle();

    if (publicUser?.id) return publicUser;

    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }

    if (attempt < REGISTER_USER_WAIT_RETRIES - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(REGISTER_USER_WAIT_MS);
    }
  }
  return null;
}

/** For API clients that use POST /login (browser login uses Supabase directly; healing also runs in getMe). */
async function ensurePublicUserRow(authUser) {
  if (!authUser?.id) return;
  const meta = authUser.user_metadata || {};
  const appMeta = authUser.app_metadata || {};
  await ensurePublicUserFromAuthSummary({
    id: authUser.id,
    email: authUser.email,
    role: meta.role || appMeta.role || 'customer',
    fullName: typeof meta.full_name === 'string' ? meta.full_name : undefined,
  });
}

async function persistProviderServices(providerId, providerMeta) {
  if (!providerMeta.services.length) return;

  const slugs = [...new Set(providerMeta.services.map((svc) => svc.category.toLowerCase().replace(/\s+/g, '-')))];
  const names = [...new Set(providerMeta.services.map((svc) => svc.category))];

  const { data: categories, error: categoryError } = await supabase
    .from('categories')
    .select('id, name, slug')
    .in('slug', slugs);

  if (categoryError) {
    throw new Error(`Failed to resolve provider categories: ${categoryError.message}`);
  }

  const categoryMap = new Map();
  for (const category of categories || []) {
    categoryMap.set(String(category.slug || '').toLowerCase(), category.id);
    categoryMap.set(String(category.name || '').toLowerCase(), category.id);
  }

  for (const requestedName of names) {
    const key = requestedName.toLowerCase();
    const slugKey = requestedName.toLowerCase().replace(/\s+/g, '-');
    const categoryId = categoryMap.get(key) || categoryMap.get(slugKey);
    if (!categoryId) {
      throw new Error(`Unknown service category: ${requestedName}`);
    }

    // Sequential writes keep category linking deterministic for easier error tracing.
    // eslint-disable-next-line no-await-in-loop
    const { error: linkError } = await supabase
      .from('provider_categories')
      .upsert(
        { provider_id: providerId, category_id: categoryId },
        { onConflict: 'provider_id,category_id' },
      );

    if (linkError) {
      throw new Error(`Failed to link provider category ${requestedName}: ${linkError.message}`);
    }
  }

  for (const svc of providerMeta.services) {
    const key = svc.category.toLowerCase();
    const slugKey = svc.category.toLowerCase().replace(/\s+/g, '-');
    const categoryId = categoryMap.get(key) || categoryMap.get(slugKey);
    if (!categoryId) continue;

    const generatedName = `${svc.category} Service`;
    // eslint-disable-next-line no-await-in-loop
    const { data: existingService, error: existingError } = await supabase
      .from('services')
      .select('id')
      .eq('provider_id', providerId)
      .eq('category_id', categoryId)
      .eq('name', generatedName)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error(`Failed checking provider service ${generatedName}: ${existingError.message}`);
    }

    if (existingService?.id) {
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError } = await supabase
        .from('services')
        .update({
          description: svc.description,
          base_price: svc.price,
          duration_minutes: 60,
          is_active: true,
        })
        .eq('id', existingService.id);

      if (updateError) {
        throw new Error(`Failed updating provider service ${generatedName}: ${updateError.message}`);
      }
    } else {
      // eslint-disable-next-line no-await-in-loop
      const { error: insertError } = await supabase
        .from('services')
        .insert({
          provider_id: providerId,
          category_id: categoryId,
          name: generatedName,
          description: svc.description,
          base_price: svc.price,
          duration_minutes: 60,
          sub_category: svc.category,
          is_active: true,
        });

      if (insertError) {
        throw new Error(`Failed creating provider service ${generatedName}: ${insertError.message}`);
      }
    }
  }
}

export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      fullName,
      phone,
      dob,
      street,
      city,
      state,
      zip,
      providerMeta: rawProviderMeta,
    } = req.body || {};

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'email, password and fullName are required'
      });
    }

    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number.'
      });
    }

    if (!dob || typeof dob !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Must be 18 or older.'
      });
    }

    const parsedDob = new Date(dob);
    const dobIso = parsedDob.toISOString().slice(0, 10);
    const dobPattern = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date();
    let age = today.getFullYear() - parsedDob.getFullYear();
    const monthDiff = today.getMonth() - parsedDob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsedDob.getDate())) {
      age -= 1;
    }

    if (!dobPattern.test(dob) || Number.isNaN(parsedDob.getTime()) || age < 18) {
      return res.status(400).json({
        success: false,
        message: 'Must be 18 or older.'
      });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must be at least 8 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special character'
      });
    }

    const roleLower = ['customer', 'provider'].includes(role) ? role : 'customer';
    const providerMeta = roleLower === 'provider'
      ? normalizeProviderMeta(rawProviderMeta, fullName)
      : null;

    // Step 1 — create user in auth.users
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      options: {
        data: {
          role: roleLower,
          full_name: fullName.trim(),
          phone: phone || null,
          dob: dobIso,
        },
      },
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already')) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (!data?.user?.id) {
      return res.status(500).json({
        success: false,
        message: 'Registration failed to create auth user.'
      });
    }

    // Get the public.users id created by the trigger
    const publicUser = await waitForPublicUser(data.user.id);
    if (!publicUser?.id) {
      return res.status(503).json({
        success: false,
        message: 'Registration is still provisioning your profile. Please try signing in again in a few seconds.'
      });
    }

    const { error: userUpdateError } = await supabase
        .from('users')
        .update({ dob: dobIso, phone: phone || null })
        .eq('supabase_id', data.user.id);
    if (userUpdateError) {
      return res.status(500).json({
        success: false,
        message: `Failed to finalize user profile: ${userUpdateError.message}`
      });
    }

    // Step 3 — insert address if provided
    if (street && city && state && zip) {
      const { error: addressError } = await supabase
        .from('addresses')
        .insert({
          user_id: publicUser.id,
          label: 'home',
          street,
          city,
          state,
          zip,
          is_default: true,
        });

      if (addressError) {
        console.error('Address insert error:', addressError.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to create address profile'
        });
      }
    }

    // Step 4 — create provider record if applicable
    if (roleLower === 'provider') {
      const { data: existingProvider, error: providerLookupError } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', publicUser.id)
        .maybeSingle();

      if (providerLookupError) {
        return res.status(500).json({
          success: false,
          message: `Failed to verify provider profile: ${providerLookupError.message}`
        });
      }

      let providerId = existingProvider?.id || null;

      if (!providerId) {
        const { data: providerRecord, error: providerError } = await supabase
          .from('providers')
          .insert({
            user_id: publicUser.id,
            business_name: providerMeta.businessName,
            description: providerMeta.description,
            rating_avg: 0,
            rating_count: 0,
          })
          .select('id')
          .single();

        if (providerError || !providerRecord?.id) {
          console.error('Provider insert error:', providerError?.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to create provider profile'
          });
        }

        providerId = providerRecord.id;
      } else {
        const { error: providerUpdateError } = await supabase
          .from('providers')
          .update({
            business_name: providerMeta.businessName,
            description: providerMeta.description,
          })
          .eq('id', providerId);

        if (providerUpdateError) {
          return res.status(500).json({
            success: false,
            message: `Failed to update provider profile: ${providerUpdateError.message}`
          });
        }
      }

      try {
        await persistProviderServices(providerId, providerMeta);
      } catch (providerMetaError) {
        return res.status(500).json({
          success: false,
          message: providerMetaError.message || 'Failed to persist provider service details'
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        token: data.session?.access_token || null,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.user_metadata?.role || roleLower,
        },
        emailConfirmationRequired: !data.session,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Failed to register' });
  }
};


export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    await ensurePublicUserRow(data.user);

    return res.status(200).json({
      success: true,
      data: {
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          role:
            data.user.user_metadata?.role
            || data.user.app_metadata?.role
            || 'customer',
        }
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Failed to login' });
  }
};