import supabase from '../config/supabase.js';

const getInternalUser = async (supabaseId) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('supabase_id', supabaseId)
    .single();
  if (error) return null;
  return data;
};

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
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

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

    // Check review doesn't already exist — booking_id is UNIQUE in reviews table
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('booking_id', booking_id)
      .single();

    if (existing) {
      return res.status(400).json({ success: false, error: 'You have already reviewed this booking' });
    }

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

    if (error) return res.status(400).json({ success: false, error: error.message });

    // Update provider rating average
    await updateProviderRating(booking.provider_id);

    return res.status(201).json({ success: true, data: review });

  } catch (err) {
    console.error('createReview error:', err);
    res.status(500).json({ success: false, error: 'Failed to create review' });
  }
};

// GET /api/reviews/:providerId
export const getProviderReviews = async (req, res) => {
  try {
    const { providerId } = req.params;

    const { data: reviews, error } = await supabase
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        reviewer:users(full_name, avatar_url)
      `)
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ success: false, error: error.message });

    return res.json({ success: true, count: reviews.length, data: reviews });

  } catch (err) {
    console.error('getProviderReviews error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
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