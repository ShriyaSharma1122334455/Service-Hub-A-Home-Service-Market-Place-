import supabase from '../config/supabase.js';

export const getProvider = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: provider, error } = await supabase
      .from('providers')
      .select(`
        id, business_name, description, rating_avg, rating_count,
        user:users(full_name, email, avatar_url, role),
        provider_categories(category_id)
      `)
      .eq('id', id)
      .single();

    if (error || !provider) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    return res.json({
      success: true,
      data: {
        id:                 provider.id,
        business_name:      provider.business_name,
        description:        provider.description,
        rating_avg:         provider.rating_avg,
        rating_count:       provider.rating_count,
        service_categories: provider.provider_categories,
        full_name:          provider.user?.full_name || provider.business_name,
        email:              provider.user?.email,
        avatar_url:         provider.user?.avatar_url,
        role:               provider.user?.role || 'provider',
      }
    });

  } catch (err) {
    console.error('Error fetching provider:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch provider' });
  }
};

export const listProviders = async (req, res) => {
  try {
    const { data: providers, error } = await supabase
      .from('providers')
      .select(`
        id, business_name, description, rating_avg, rating_count,
        user:users(full_name, email, avatar_url)
      `)
      .eq('is_active', true);

    if (error) return res.status(400).json({ success: false, error: error.message });

    const list = providers.map(p => ({
      id:           p.id,
      business_name: p.business_name,
      description:  p.description,
      rating_avg:   p.rating_avg,
      rating_count: p.rating_count,
      full_name:    p.user?.full_name || p.business_name,
      email:        p.user?.email,
      avatar_url:   p.user?.avatar_url,
    }));

    return res.json({
      success: true,
      data: { providers: list },
      pagination: { total: list.length, page: 1, limit: list.length }
    });

  } catch (err) {
    console.error('Error fetching providers:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch providers' });
  }
};

export const getProvidersByService = async (req, res) => {
  try {
    const { serviceId } = req.params;

    // Find providers who offer this service via provider_services table
    const { data, error } = await supabase
      .from('provider_services')
      .select(`
        custom_price, custom_description,
        provider:providers(
          id, business_name, rating_avg, rating_count, is_active,
          user:users(full_name, avatar_url)
        )
      `)
      .eq('service_id', serviceId)
      .eq('is_active', true);

    if (error) return res.status(400).json({ success: false, error: error.message });

    // Filter active providers
    const list = data
      .filter(row => row.provider?.is_active)
      .map(row => ({
        id:                 row.provider.id,
        business_name:      row.provider.business_name,
        rating_avg:         row.provider.rating_avg,
        rating_count:       row.provider.rating_count,
        full_name:          row.provider.user?.full_name || null,
        avatar_url:         row.provider.user?.avatar_url || null,
        custom_price:       row.custom_price ?? null,
        custom_description: row.custom_description ?? null,
      }));

    return res.json({ success: true, count: list.length, data: list });

  } catch (err) {
    console.error('getProvidersByService error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch providers for service' });
  }
};

export const searchProviders = async (req, res) => {
  try {
    const { category, minRating, isActive, search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('providers')
      .select(`
        id, business_name, description, rating_avg, rating_count, is_active,
        user:users(full_name, email, avatar_url),
        provider_categories(category_id)
      `);

    // Filters — replaces your Mongoose filter object
    if (minRating)          query = query.gte('rating_avg', Number(minRating));
    if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
    if (search)             query = query.ilike('business_name', `%${search}%`);
    if (category) {
      // Filter by category via junction table
      query = query.eq('provider_categories.category_id', category);
    }

    // Pagination
    const from = (Number(page) - 1) * Number(limit);
    const to   = from + Number(limit) - 1;
    query = query.range(from, to);

    const { data: providers, error, count } = await query;

    if (error) return res.status(400).json({ success: false, error: error.message });

    const list = providers.map(p => ({
      id:                 p.id,
      business_name:      p.business_name,
      description:        p.description,
      rating_avg:         p.rating_avg,
      rating_count:       p.rating_count,
      is_active:          p.is_active,
      service_categories: p.provider_categories,
      full_name:          p.user?.full_name,
      email:              p.user?.email,
      avatar_url:         p.user?.avatar_url,
    }));

    return res.json({
      success: true,
      count: list.length,
      total: count,
      page: Number(page),
      data: { providers: list }
    });

  } catch (err) {
    console.error('searchProviders error:', err);
    res.status(500).json({ success: false, error: 'Failed to search providers' });
  }
};

export default { getProvider, listProviders, getProvidersByService, searchProviders };