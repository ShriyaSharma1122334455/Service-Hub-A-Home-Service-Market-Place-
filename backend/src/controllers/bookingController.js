import supabase from '../config/supabase.js';

// helper — gets internal public.users id from supabase auth id
const getInternalUser = async (supabaseId) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('supabase_id', supabaseId)
    .single();
  if (error) return null;
  return data;
};

export const createBooking = async (req, res) => {
  try {
    const { provider_id, service_id, availability_id, scheduled_at, notes,
            address_street, address_city, address_state, address_zip } = req.body;

    if (!provider_id || !service_id || !scheduled_at) {
      return res.status(400).json({ success: false, error: 'provider_id, service_id and scheduled_at are required' });
    }

    // Get internal customer id
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get service price
    const { data: service } = await supabase
      .from('services')
      .select('base_price')
      .eq('id', service_id)
      .single();

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        customer_id:      internalUser.id,
        provider_id,
        service_id,
        availability_id:  availability_id || null,
        scheduled_at,
        notes:            notes || null,
        total_price:      service?.base_price || 0,
        status:           'pending',
        payment_status:   'pending',
        address_street:   address_street || null,
        address_city:     address_city   || null,
        address_state:    address_state  || null,
        address_zip:      address_zip    || null,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Mark availability slot as booked if provided
    if (availability_id) {
      await supabase
        .from('availability')
        .update({ is_booked: true })
        .eq('id', availability_id);
    }

    res.status(201).json({ success: true, data: booking });

  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
};

export const listBookings = async (req, res) => {
  try {
    // Get internal user first
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let query = supabase
      .from('bookings')
      .select(`
        *,
        service:services(name, base_price),
        provider:providers(business_name, rating_avg)
      `)
      .order('created_at', { ascending: false });

    // Filter by role — replaces your old filter object
    if (internalUser.role === 'provider') {
      // Need provider id not user id
      const { data: provider } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', internalUser.id)
        .single();

      if (!provider) {
        return res.status(404).json({ success: false, error: 'Provider profile not found. Complete your provider profile setup first' });
      }
      query = query.eq('provider_id', provider.id);
    } else {
      query = query.eq('customer_id', internalUser.id);
    }

    const { data: bookings, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, count: bookings.length, data: bookings });

  } catch (err) {
    console.error('List bookings error:', err);
    res.status(500).json({ success: false, error: 'Failed to list bookings' });
  }
};

export const getBooking = async (req, res) => {
  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        *,
        service:services(name, base_price, description),
        provider:providers(business_name, rating_avg, description)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Get booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch booking' });
  }
};

export const acceptBooking = async (req, res) => {
  try {
    // Resolve the requesting provider's internal id
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', internalUser.id)
      .single();

    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider profile not found. Complete your provider profile setup first' });
    }

    // Fetch booking and verify ownership before updating
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, provider_id, status')
      .eq('id', req.params.id)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (existing.provider_id !== provider.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to accept this booking' });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !booking) {
      return res.status(400).json({ success: false, error: error?.message || 'Failed to update booking' });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Accept booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to accept booking' });
  }
};

export const rejectBooking = async (req, res) => {
  try {
    // Resolve the requesting provider's internal id
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', internalUser.id)
      .single();

    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider profile not found. Complete your provider profile setup first' });
    }

    // Fetch booking and verify ownership + status before updating
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, provider_id, status')
      .eq('id', req.params.id)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (existing.provider_id !== provider.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to reject this booking' });
    }

    if (existing.status !== 'pending' && existing.status !== 'confirmed') {
      return res.status(400).json({ success: false, error: `Cannot reject a booking with status '${existing.status}'` });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: req.body.reason || 'Rejected by provider'
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !booking) {
      return res.status(400).json({ success: false, error: error?.message || 'Failed to update booking' });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Reject booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to reject booking' });
  }
};

export const completeBooking = async (req, res) => {
  try {
    // Resolve the requesting provider's internal id
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', internalUser.id)
      .single();

    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider profile not found. Complete your provider profile setup first' });
    }

    // Fetch booking and verify ownership + status
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, provider_id, status')
      .eq('id', req.params.id)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (existing.provider_id !== provider.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to complete this booking' });
    }

    if (existing.status !== 'confirmed') {
      return res.status(400).json({ success: false, error: 'Can only complete confirmed bookings' });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !booking) {
      return res.status(400).json({ success: false, error: error?.message || 'Failed to update booking' });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Complete booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete booking' });
  }
};

export default { createBooking, listBookings, getBooking, acceptBooking, rejectBooking, completeBooking };