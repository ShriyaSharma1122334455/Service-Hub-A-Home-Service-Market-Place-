import supabase from '../config/supabase.js';

/**
 * GET /api/availability/:providerId
 */
export const getProviderAvailability = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'date query param is required (format: YYYY-MM-DD)',
      });
    }

    const { data: slots, error } = await supabase
      .from('availability_slots')
      .select('id, date, start_time, end_time, is_booked')
      .eq('provider_id', providerId)
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.json({ success: true, data: slots ?? [] });
  } catch (err) {
    console.error('getProviderAvailability error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch availability' });
  }
};

/**
 * GET /api/availability/:providerId/range*/
export const getProviderAvailabilityRange = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'start and end query params are required (format: YYYY-MM-DD)',
      });
    }

    const { data: slots, error } = await supabase
      .from('availability_slots')
      .select('id, date, start_time, end_time, is_booked')
      .eq('provider_id', providerId)
      .gte('date', start)
      .lte('date', end)
      .eq('is_booked', false)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Group by date for easy calendar rendering on the frontend
    const grouped = {};
    for (const slot of slots ?? []) {
      if (!grouped[slot.date]) grouped[slot.date] = [];
      grouped[slot.date].push(slot);
    }

    return res.json({ success: true, data: slots ?? [], grouped });
  } catch (err) {
    console.error('getProviderAvailabilityRange error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch availability range' });
  }
};