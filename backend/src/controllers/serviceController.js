import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

// ── Shared ownership helper ───────────────────────────────────────────────

/**
 * Resolves the providers row for the currently authenticated user.
 * Sends the appropriate error response and returns null if not found,
 * so callers can do:  if (!providerProfile) return;
 *
 * @param {string}                         supabaseUserId  — req.user.id
 * @param {import('express').Response}     res
 * @returns {Promise<{id: string}|null>}
 */
async function getCallerProviderProfile(supabaseUserId, res) {
  const internalUser = await getInternalUser(supabaseUserId);
  if (!internalUser) {
    profileNotFoundResponse(res);
    return null;
  }

  const { data: providerProfile, error } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', internalUser.id)
    .maybeSingle();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return null;
  }
  if (!providerProfile) {
    res.status(403).json({ success: false, error: 'Provider profile not found' });
    return null;
  }

  return providerProfile;
}

// listServices

export const listServices = async (req, res) => {
  try {
    const { category, minPrice, maxPrice, search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('services')
      .select(
        `*, category:categories(name, slug), provider:providers(id, business_name, rating_avg, rating_count)`,
        { count: 'exact' },
      )
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (category)  query = query.eq('category_id', category);
    if (search)    query = query.ilike('name', `%${search}%`);
    if (minPrice)  query = query.gte('base_price', Number(minPrice));
    if (maxPrice)  query = query.lte('base_price', Number(maxPrice));

    const from = (Number(page) - 1) * Number(limit);
    const to   = from + Number(limit) - 1;
    query = query.range(from, to);

    const { data: services, error, count } = await query;

    if (error) return res.status(400).json({ success: false, error: error.message });

    return res.json({
      success: true,
      count: services.length,
      total: count,
      page: Number(page),
      data: services,
    });

  } catch (err) {
    console.error('listServices error:', err);
    res.status(500).json({ success: false, error: 'Failed to list services' });
  }
};

// getService

export const getService = async (req, res) => {
  try {
    const { data: service, error } = await supabase
      .from('services')
      .select(`*, category:categories(name, slug)`)
      .eq('id', req.params.id)
      .single();

    if (error || !service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    res.json({ success: true, data: service });

  } catch (err) {
    console.error('getService error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch service' });
  }
};

// createService

export const createService = async (req, res) => {
  try {
    const { category_id, name, description, base_price, duration_minutes, sub_category } = req.body;

    if (!category_id || !name || !base_price || !duration_minutes) {
      return res.status(400).json({
        success: false,
        error: 'category_id, name, base_price and duration_minutes are required',
      });
    }

    const providerProfile = await getCallerProviderProfile(req.user.id, res);
    if (!providerProfile) return;   // response already sent

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        provider_id:      providerProfile.id,
        category_id,
        name,
        description,
        base_price,
        duration_minutes,
        sub_category: sub_category || null,
        is_active:    true,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, error: error.message });

    res.status(201).json({ success: true, data: service });

  } catch (err) {
    console.error('createService error:', err);
    res.status(500).json({ success: false, error: 'Failed to create service' });
  }
};

// updateService
// ownership enforced via .eq('provider_id', providerProfile.id) in query.
// only whitelisted fields accepted — no req.body spread.
export const updateService = async (req, res) => {
  try {
    // Resolve caller's provider profile (sends error and returns null if not found)
    const providerProfile = await getCallerProviderProfile(req.user.id, res);
    if (!providerProfile) return;

    //whitelist — never spread req.body directly into a DB update
    const {
      name,
      description,
      base_price,
      duration_minutes,
      sub_category,
      is_active,
      category_id,
    } = req.body;

    // Build update object with only defined fields (avoid overwriting with undefined)
    const updatePayload = {
      updated_at: new Date().toISOString(),
    };
    if (name            !== undefined) updatePayload.name             = name;
    if (description     !== undefined) updatePayload.description      = description;
    if (base_price      !== undefined) updatePayload.base_price       = base_price;
    if (duration_minutes !== undefined) updatePayload.duration_minutes = duration_minutes;
    if (sub_category    !== undefined) updatePayload.sub_category     = sub_category;
    if (is_active       !== undefined) updatePayload.is_active        = is_active;
    if (category_id     !== undefined) updatePayload.category_id      = category_id;

    // ownership enforced — .eq('provider_id', …) means only the owning
    // provider's service can match; a different provider's service returns
    // 0 rows, which we handle as either 403 (exists but not theirs) or 404.
    const { data: service, error } = await supabase
      .from('services')
      .update(updatePayload)
      .eq('id', req.params.id)
      .eq('provider_id', providerProfile.id)   // ← ownership guard
      .select()
      .single();

    if (error || !service) {
      // Distinguish 403 from 404: check whether the service exists at all
      const { data: exists } = await supabase
        .from('services')
        .select('id')
        .eq('id', req.params.id)
        .maybeSingle();

      if (exists) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: you do not own this service',
        });
      }
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    res.json({ success: true, data: service });

  } catch (err) {
    console.error('updateService error:', err);
    res.status(500).json({ success: false, error: 'Failed to update service' });
  }
};

// deleteService
// ownership enforced via .eq('provider_id', providerProfile.id).
export const deleteService = async (req, res) => {
  try {
    const providerProfile = await getCallerProviderProfile(req.user.id, res);
    if (!providerProfile) return;

    // A-02: .eq('provider_id', …) ensures only the owning provider's service is deleted.
    // .select('id') makes PostgREST return the deleted rows so we can check the count.
    const { data, error } = await supabase
      .from('services')
      .delete()
      .eq('id', req.params.id)
      .eq('provider_id', providerProfile.id)   // ← ownership guard
      .select('id');

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!data?.length) {
      // No rows deleted — distinguish 403 from 404
      const { data: exists } = await supabase
        .from('services')
        .select('id')
        .eq('id', req.params.id)
        .maybeSingle();

      if (exists) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: you do not own this service',
        });
      }
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    res.json({ success: true, message: 'Service deleted' });

  } catch (err) {
    console.error('deleteService error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete service' });
  }
};

export default { listServices, getService, createService, updateService, deleteService };