import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

// ── Shared helper ─────────────────────────────────────────────────────────

/**
 * Resolves the providers.id for a given public.users row.
 * Returns null (without throwing) when the provider profile does not exist.
 * @param {string} internalUserId — public.users UUID
 * @returns {Promise<string|null>}
 */
async function resolveProviderId(internalUserId) {
  const { data: provRow } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', internalUserId)
    .single();
  return provRow?.id ?? null;
}
// createBooking
export const createBooking = async (req, res) => {
  try {
    const {
      provider_id,
      service_id,
      availability_id,
      scheduled_at,
      notes,
      address_street,
      address_city,
      address_state,
      address_zip,
    } = req.body;

    // ── Required field validation ─────────────────────────────────────────
    if (!provider_id || !service_id || !scheduled_at) {
      return res.status(400).json({
        success: false,
        error: 'provider_id, service_id and scheduled_at are required',
      });
    }

    // ── A-08: Validate scheduled_at is at least 30 minutes in the future ─
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'scheduled_at must be a valid ISO 8601 date string',
      });
    }
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
    if (scheduledDate < thirtyMinutesFromNow) {
      return res.status(400).json({
        success: false,
        error: 'Booking must be scheduled at least 30 minutes from now',
      });
    }

    // ── Slot conflict guard ───────────────────────────────────────────────
    const { data: conflicting, error: conflictError } = await supabase
      .from('bookings')
      .select('id')
      .eq('provider_id', provider_id)
      .eq('scheduled_at', scheduled_at)
      .in('status', ['pending', 'confirmed'])
      .limit(1);

    if (conflictError) {
      return res.status(400).json({ success: false, error: conflictError.message });
    }
    if (Array.isArray(conflicting) && conflicting.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'This time slot is no longer available. Please choose another time.',
        code: 'SLOT_UNAVAILABLE',
      });
    }

    // ── Verify provider exists, is verified, and fetch user_id for A-05 ──
    const { data: provider } = await supabase
      .from('providers')
      .select('id, verification_status, user_id')   // user_id needed for self-booking check
      .eq('id', provider_id)
      .single();

    if (!provider || provider.verification_status !== 'verified') {
      return res.status(403).json({
        success: false,
        error: 'Bookings are only allowed with verified providers',
      });
    }

    // ── Resolve internal customer id ──────────────────────────────────────
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    // ── A-05: Prevent self-booking ────────────────────────────────────────
    if (provider.user_id === internalUser.id) {
      return res.status(400).json({
        success: false,
        error: 'You cannot book your own services',
      });
    }

    // ── A-11: Validate service belongs to the provider and is active ──────
    const { data: service } = await supabase
      .from('services')
      .select('id, base_price, provider_id, is_active')
      .eq('id', service_id)
      .single();

    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    if (service.provider_id !== provider_id) {
      return res.status(400).json({
        success: false,
        error: 'The requested service does not belong to the specified provider',
      });
    }
    if (!service.is_active) {
      return res.status(400).json({
        success: false,
        error: 'This service is no longer available',
      });
    }

    // ── Insert booking ────────────────────────────────────────────────────
    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        customer_id:    internalUser.id,
        provider_id,
        service_id,
        availability_id: availability_id || null,
        scheduled_at,
        notes:          notes || null,
        total_price:    service.base_price || 0,
        status:         'pending',
        payment_status: 'pending',
        address_street: address_street || null,
        address_city:   address_city   || null,
        address_state:  address_state  || null,
        address_zip:    address_zip    || null,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // ── Mark availability slot as booked if provided ──────────────────────
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
    console.error('Create booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
};

// listBookings

export const listBookings = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    let query = supabase
      .from('bookings')
      .select(`
        *,
        service:services(name, base_price),
        provider:providers(business_name, rating_avg),
        customer:users(full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (internalUser.role === 'provider') {
      const { data: provider } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', internalUser.id)
        .single();

      if (!provider) {
        return res.status(404).json({
          success: false,
          error: 'Provider profile not found. Complete your provider profile setup first',
        });
      }
      query = query.eq('provider_id', provider.id);
    } else if (internalUser.role !== 'admin') {
      query = query.eq('customer_id', internalUser.id);
    }
    // admin: no filter — sees all bookings

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

// getBooking
// ownership is now verified before returning data.
// payment_intent_id is stripped from non-admin responses.

export const getBooking = async (req, res) => {
  try {
    // 1. Resolve the caller's internal user record
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    // 2. Fetch the booking with safe explicit column list
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        customer_id,
        provider_id,
        service_id,
        availability_id,
        status,
        scheduled_at,
        completed_at,
        total_price,
        payment_status,
        payment_intent_id,
        notes,
        cancellation_reason,
        created_at,
        updated_at,
        address_street,
        address_city,
        address_state,
        address_zip,
        service:services(name, base_price, description),
        provider:providers(business_name, rating_avg, description)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // 3. Resolve caller's provider id (only relevant for provider role)
    let callerProviderId = null;
    if (internalUser.role === 'provider') {
      callerProviderId = await resolveProviderId(internalUser.id);
    }

    // 4. Access control — must be the customer, the assigned provider, or admin
    const isCustomer = booking.customer_id === internalUser.id;
    const isProvider  = callerProviderId !== null && booking.provider_id === callerProviderId;
    const isAdmin     = internalUser.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // 5. Strip sensitive internal fields from non-admin responses
    if (!isAdmin) {
      // eslint-disable-next-line no-unused-vars
      const { payment_intent_id, ...safeBooking } = booking;
      return res.json({ success: true, data: safeBooking });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Get booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch booking' });
  }
};
// acceptBooking
// the UPDATE now includes .eq('status', 'pending') so the
// transition is atomic — a second concurrent request will match
// zero rows and receive a 409 instead of a silent double-accept.

export const acceptBooking = async (req, res) => {
  try {
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
      return res.status(404).json({
        success: false,
        error: 'Provider profile not found. Complete your provider profile setup first',
      });
    }

    // Fetch to verify ownership and current status
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
    if (existing.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Cannot accept a booking with status '${existing.status}'`,
      });
    }

    // both id AND status must match.
    // If another request already changed the status, 0 rows are updated.
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', req.params.id)
      .eq('provider_id', provider.id)   // belt-and-suspenders ownership
      .eq('status', 'pending')           // ← atomic guard
      .select()
      .single();

    if (error || !booking) {
      return res.status(409).json({
        success: false,
        error: 'Booking status was changed by another request. Please refresh.',
      });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Accept booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to accept booking' });
  }
};

// rejectBooking
// Role: provider (own bookings only)
export const rejectBooking = async (req, res) => {
  try {
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
      return res.status(404).json({
        success: false,
        error: 'Provider profile not found. Complete your provider profile setup first',
      });
    }

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
      return res.status(400).json({
        success: false,
        error: `Cannot reject a booking with status '${existing.status}'`,
      });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: req.body.reason || 'Rejected by provider',
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !booking) {
      return res.status(400).json({
        success: false,
        error: error?.message || 'Failed to update booking',
      });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Reject booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to reject booking' });
  }
};

export const completeBooking = async (req, res) => {
  try {
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
      return res.status(404).json({
        success: false,
        error: 'Provider profile not found. Complete your provider profile setup first',
      });
    }

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
      return res.status(409).json({
        success: false,
        error: `Can only complete confirmed bookings (current status: '${existing.status}')`,
      });
    }

    //only updates when status is still 'confirmed'
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('provider_id', provider.id)
      .eq('status', 'confirmed')   // ← atomic guard
      .select()
      .single();

    if (error || !booking) {
      return res.status(409).json({
        success: false,
        error: 'Booking status was changed by another request. Please refresh.',
      });
    }

    res.json({ success: true, data: booking });

  } catch (err) {
    console.error('Complete booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete booking' });
  }
};

export default {
  createBooking,
  listBookings,
  getBooking,
  acceptBooking,
  rejectBooking,
  completeBooking,
};