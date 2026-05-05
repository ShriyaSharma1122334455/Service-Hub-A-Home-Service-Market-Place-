import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

// POST /api/reviews
export const createReview = async (req, res) => {
  try {
    const { booking_id, rating, comment } = req.body;

    if (!booking_id || !rating) {
      return res.status(400).json({ success: false, error: 'booking_id and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
    }

    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    // Verify the booking exists, is completed, and belongs to this user
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, provider_id, status, customer_id')
      .eq('id', booking_id)
      .eq('customer_id', internalUser.id)
      .single();

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Can only review completed bookings' });
    }

    // INSERT directly and let the UNIQUE constraint on booking_id catch duplicates atomically
    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        booking_id,
        reviewer_id: internalUser.id,
        provider_id: booking.provider_id,
        rating,
        comment:     comment || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'You have already reviewed this booking' });
      }
      return res.status(400).json({ success: false, error: error.message });
    }

    // Update provider rating average
    await updateProviderRating(booking.provider_id);

    return res.status(201).json({ success: true, data: review });

  } catch (err) {
    console.error('createReview error:', err);
    res.status(500).json({ success: false, error: 'Failed to create review' });
  }
};

// GET /api/reviews/:providerId?page=1&limit=5
export const getProviderReviews = async (req, res) => {
  try {
    const { providerId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 5));
    const offset = (page - 1) * limit;

    // Total count (cheap head-only request)
    const { count, error: countErr } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId);

    if (countErr) return res.status(400).json({ success: false, error: countErr.message });

    // Page of reviews
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select(`
        id, booking_id, rating, comment, created_at,
        reviewer:users(full_name, avatar_url)
      `)
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(400).json({ success: false, error: error.message });

    const totalPages = Math.ceil((count || 0) / limit);

    // Return under .data so fetchApi keeps the pagination envelope intact
    return res.json({
      success: true,
      data: { reviews, count: count || 0, totalPages, page },
    });

  } catch (err) {
    console.error('getProviderReviews error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
};

// GET /api/reviews/service/:serviceId?limit=10
export const getServiceReviews = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

    // Resolve booking IDs that belong to this service
    const { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('service_id', serviceId);

    if (bErr) return res.status(400).json({ success: false, error: bErr.message });

    if (!bookings?.length) {
      return res.json({ success: true, data: { reviews: [], count: 0, avgRating: 0 } });
    }

    const bookingIds = bookings.map(b => b.id);

    const { data: reviews, count, error } = await supabase
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        reviewer:users(full_name, avatar_url)
      `, { count: 'exact' })
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(400).json({ success: false, error: error.message });

    const avgRating = reviews?.length
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : 0;

    return res.json({
      success: true,
      data: { reviews: reviews || [], count: count || 0, avgRating },
    });

  } catch (err) {
    console.error('getServiceReviews error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch service reviews' });
  }
};

// Recalculates and updates provider rating after a new review
// Called internally — not a route handler
const updateProviderRating = async (providerId) => {
  try {
    const { data: reviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('provider_id', providerId);

    if (!reviews || reviews.length === 0) return;

    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await supabase
      .from('providers')
      .update({
        rating_avg:   Math.round(avg * 100) / 100, // 2 decimal places
        rating_count: reviews.length
      })
      .eq('id', providerId);

  } catch (err) {
    console.error('updateProviderRating error:', err);
  }
};

export default { createReview, getProviderReviews };