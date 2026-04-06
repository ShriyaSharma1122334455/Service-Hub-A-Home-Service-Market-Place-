import supabase from '../config/supabase.js';

export const listServices = async (req, res) => {
  try {
    const { category, minPrice, maxPrice, search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('services')
      .select(`*, category:categories(name, slug)`)
      .eq('is_active', true)
      .order('name', { ascending: true });

    // Filters
    if (category) query = query.eq('category_id', category);
    if (search)   query = query.ilike('name', `%${search}%`); // replaces $regex
    if (minPrice) query = query.gte('base_price', Number(minPrice));
    if (maxPrice) query = query.lte('base_price', Number(maxPrice));

    // Pagination
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
      data: services
    });

  } catch (err) {
    console.error('listServices error:', err);
    res.status(500).json({ success: false, error: 'Failed to list services' });
  }
};

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
    console.error('Error fetching service:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch service' });
  }
};

export const createService = async (req, res) => {
  try {
    const { category_id, name, description, base_price, duration_minutes, sub_category } = req.body;

    if (!category_id || !name || !base_price || !duration_minutes) {
      return res.status(400).json({ success: false, error: 'category_id, name, base_price and duration_minutes are required' });
    }

    // Get provider id from user
    // const { data: provider } = await supabase
    //   .from('providers')
    //   .select('id')
    //   .eq('user_id', req.user.id)  // req.user.id is supabase_id here — need internal user first
    //   .single();

    // Actually need internal user id first
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_id', req.user.id)
      .single();

    const { data: providerProfile } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!providerProfile) {
      return res.status(403).json({ success: false, error: 'Provider profile not found' });
    }

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        provider_id:      providerProfile.id,
        category_id,
        name,
        description,
        base_price,
        duration_minutes,
        sub_category:     sub_category || null,
        is_active:        true
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

export const updateService = async (req, res) => {
  try {
    const { data: service, error } = await supabase
      .from('services')
      .update({ ...req.body, updated_at: new Date() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    res.json({ success: true, data: service });

  } catch (err) {
    console.error('updateService error:', err)
    res.status(400).json({ success: false, error: 'Failed to update service' });
  }
};

export const deleteService = async (req, res) => {
  try {
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(404).json({ success: false, error: 'Service not found' });

    res.json({ success: true, message: 'Service deleted' });

  } catch (err) {
    console.error('deleteService error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete service' });
  }
};

export default { listServices, getService, createService, updateService, deleteService };