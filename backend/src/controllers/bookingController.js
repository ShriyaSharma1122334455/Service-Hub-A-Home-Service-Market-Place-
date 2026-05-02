import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import logger from '../utils/logger.js';

export const createBooking = async (req, res) => {
  try {
    const { provider_id, service_id, availability_id, scheduled_at, notes,
            address_street, address_city, address_state, address_zip } = req.body;

    if (!provider_id || !service_id || !scheduled_at) {
      return res.status(400).json({ success: false, error: 'provider_id, service_id and scheduled_at are required' });
    }

    if (new Date(scheduled_at) <= new Date()) {
      return res.status(400).json({ success: false, error: 'Booking must be scheduled in the future' });
    }

    // Get internal customer id
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    // Block bookings with unverified providers
    const { data: provider } = await supabase
      .from('providers')
      .select('id, verification_status, user_id')
      .eq('id', provider_id)
      .single();

    if (!provider || provider.verification_status !== 'verified') {
      return res.status(403).json({ success: false, error: 'Bookings are only allowed with verified providers' });
    }

    if (provider.user_id === internalUser.id) {
      return res.status(400).json({ success: false, error: 'You cannot book your own services' });
    }

    // Basic server-side slot conflict guard.
    const { data: conflicting, error: conflictError } = await supabase
      .from('bookings')
      .select('id')
      .eq('provider_id', provider_id)
      .eq('scheduled_at', scheduled_at)
      .in('status', [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED])
      .limit(1);

    if (conflictError) {
      return res.status(400).json({ success: false, error: conflictError.message });
    }

    if (Array.isArray(conflicting) && conflicting.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'This slot is no longer available. Please choose another time.',
        code: 'SLOT_UNAVAILABLE',
      });
    }

    // Get service and validate it belongs to the specified provider
    const { data: service } = await supabase
      .from('services')
      .select('base_price, provider_id')
      .eq('id', service_id)
      .single();

    if (service && service.provider_id !== provider.id) {
      return res.status(400).json({ success: false, error: 'Service does not belong to the specified provider' });
    }

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
        status:           BOOKING_STATUS.PENDING,
        payment_status:   BOOKING_STATUS.PENDING,
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
      const { error: availabilityError } = await supabase
        .from('availability')
        .update({ is_booked: true })
        .eq('id', availability_id);
      if (availabilityError) {
        return res.status(400).json({ success: false, error: availabilityError.message });
      }
    }

    res.status(201).json({ success: true, data: booking });

  } catch (err) {
    logger.error({ err }, 'Create booking error');
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
};

export const listBookings = async (req, res) => {
  try {
    // Get internal user first
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('bookings')
      .select(`
        *,
        service:services(name, base_price),
        provider:providers(business_name, rating_avg),
        customer:users(full_name, email)
      `, { count: 'exact' })
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

    const { data: bookings, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      count: bookings.length,
      page,
      limit,
      ...(typeof count === 'number' ? { total: count } : {}),
      data: bookings
    });

  } catch (err) {
    logger.error({ err }, 'List bookings error');
    res.status(500).json({ success: false, error: 'Failed to list bookings' });
  }
};

export const getBooking = async (req, res) => {
  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        customer_id,
        provider_id,
        service_id,
        availability_id,
        scheduled_at,
        notes,
        total_price,
        status,
        payment_status,
        cancellation_reason,
        completed_at,
        address_street,
        address_city,
        address_state,
        address_zip,
        created_at,
        updated_at,
        service:services(name, base_price, description),
        provider:providers(business_name, rating_avg, description)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', internalUser.id)
      .single();

    const isCustomer = booking.customer_id === internalUser.id;
    const isProvider = provider?.id === booking.provider_id;
    const isAdmin = internalUser.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const customerBooking = {
      id: booking.id,
      provider_id: booking.provider_id,
      service_id: booking.service_id,
      availability_id: booking.availability_id,
      scheduled_at: booking.scheduled_at,
      notes: booking.notes,
      total_price: booking.total_price,
      status: booking.status,
      payment_status: booking.payment_status,
      cancellation_reason: booking.cancellation_reason,
      completed_at: booking.completed_at,
      address_street: booking.address_street,
      address_city: booking.address_city,
      address_state: booking.address_state,
      address_zip: booking.address_zip,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      service: booking.service,
      provider: booking.provider
    };

    const privilegedBooking = {
      ...customerBooking,
      customer_id: booking.customer_id
    };

    res.json({ success: true, data: isCustomer && !isAdmin ? customerBooking : privilegedBooking });

  } catch (err) {
    logger.error({ err }, 'Get booking error');
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
      .update({ status: BOOKING_STATUS.CONFIRMED })
      .eq('id', req.params.id)
      .eq('status', BOOKING_STATUS.PENDING)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!booking) {
      return res.status(409).json({ success: false, error: 'Booking is no longer pending' });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    logger.error({ err }, 'Accept booking error');
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

    if (existing.status !== BOOKING_STATUS.PENDING && existing.status !== BOOKING_STATUS.CONFIRMED) {
      return res.status(400).json({ success: false, error: `Cannot reject a booking with status '${existing.status}'` });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.CANCELLED,
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
    logger.error({ err }, 'Reject booking error');
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

    if (existing.status !== BOOKING_STATUS.CONFIRMED) {
      return res.status(400).json({ success: false, error: 'Can only complete confirmed bookings' });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.COMPLETED,
        completed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('status', BOOKING_STATUS.CONFIRMED)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!booking) {
      return res.status(409).json({ success: false, error: 'Booking is no longer confirmed' });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    logger.error({ err }, 'Complete booking error');
    res.status(500).json({ success: false, error: 'Failed to complete booking' });
  }
};

export default { createBooking, listBookings, getBooking, acceptBooking, rejectBooking, completeBooking };
