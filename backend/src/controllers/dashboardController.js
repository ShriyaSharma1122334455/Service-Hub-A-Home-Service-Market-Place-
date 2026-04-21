import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

const BREAKDOWN_LIMIT = 20;

function toDayKey(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

function mapBookingRow(b) {
  return {
    id: b.id,
    status: b.status,
    scheduled_at: b.scheduled_at,
    total_price: Number(b.total_price) || 0,
    service_name: b.service?.name ?? null,
    customer_name: b.customer?.full_name ?? null,
  };
}

/**
 * GET /api/dashboard/provider
 * Aggregated stats, calendar-friendly booking groups, and pending/confirmed lists.
 */
export const getProviderDashboard = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    if (internalUser.role !== 'provider') {
      return res.status(403).json({
        success: false,
        error: 'Provider dashboard is only available for provider accounts.',
      });
    }

    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('id, business_name, rating_avg')
      .eq('user_id', internalUser.id)
      .maybeSingle();

    if (providerError) {
      return res.status(400).json({ success: false, error: providerError.message });
    }

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider profile not found. Complete your provider profile setup first',
      });
    }

    const { data: rawBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        scheduled_at,
        total_price,
        service:services(name),
        customer:users!bookings_customer_id_fkey(full_name)
      `)
      .eq('provider_id', provider.id)
      .order('scheduled_at', { ascending: true });

    if (bookingsError) {
      return res.status(400).json({ success: false, error: bookingsError.message });
    }

    const bookings = rawBookings || [];

    let pending = 0;
    let confirmed = 0;
    let completed = 0;
    let cancelled = 0;

    let totalEarnings = 0;

    for (const b of bookings) {
      const s = b.status;
      if (s === 'pending') pending += 1;
      else if (s === 'confirmed') confirmed += 1;
      else if (s === 'completed') {
        completed += 1;
        totalEarnings += Number(b.total_price) || 0;
      } else if (s === 'cancelled') cancelled += 1;
    }

    const totalBookings = bookings.length;

    const pendingList = bookings
      .filter((b) => b.status === 'pending')
      .map(mapBookingRow)
      .slice(0, BREAKDOWN_LIMIT);

    const confirmedList = bookings
      .filter((b) => b.status === 'confirmed')
      .map(mapBookingRow)
      .slice(0, BREAKDOWN_LIMIT);

    const dayMap = new Map();
    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      const day = toDayKey(b.scheduled_at);
      if (!day) continue;
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day).push({
        id: b.id,
        status: b.status,
        scheduled_at: b.scheduled_at,
        total_price: Number(b.total_price) || 0,
        service_name: b.service?.name ?? null,
      });
    }

    const calendar = [...dayMap.entries()]
      .map(([date, items]) => ({
        date,
        items: items.sort((a, c) =>
          String(a.scheduled_at).localeCompare(String(c.scheduled_at)),
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      success: true,
      data: {
        provider: {
          id: provider.id,
          business_name: provider.business_name,
          rating_avg: provider.rating_avg,
        },
        stats: {
          total_bookings: totalBookings,
          pending,
          confirmed,
          completed,
          cancelled,
          total_earnings: Math.round(totalEarnings * 100) / 100,
        },
        breakdown: {
          pending: pendingList,
          confirmed: confirmedList,
        },
        calendar,
      },
    });
  } catch (err) {
    console.error('getProviderDashboard error:', err);
    res.status(500).json({ success: false, error: 'Failed to load provider dashboard' });
  }
};

export default { getProviderDashboard };
