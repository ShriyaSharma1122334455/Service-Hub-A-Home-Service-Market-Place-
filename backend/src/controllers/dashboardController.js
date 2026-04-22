import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

const BREAKDOWN_LIMIT = 20;
const CALENDAR_ALLOWED_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled']);

function toDayKey(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

function toTimeKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(11, 16);
}

function safeTimezone(timezone) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
}

function getDatePartsInTimezone(iso, timezone) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  if (!lookup.year || !lookup.month || !lookup.day || !lookup.hour || !lookup.minute) {
    return null;
  }
  return {
    dateKey: `${lookup.year}-${lookup.month}-${lookup.day}`,
    timeKey: `${lookup.hour}:${lookup.minute}`,
  };
}

function mapBookingRow(b) {
  return {
    id: b.id,
    status: b.status,
    scheduled_at: b.scheduled_at,
    scheduled_date: toDayKey(b.scheduled_at),
    scheduled_time: toTimeKey(b.scheduled_at),
    total_price: Number(b.total_price) || 0,
    service_name: b.service?.name ?? null,
    customer_name: b.customer?.full_name ?? null,
  };
}

function normalizeStatuses(input) {
  if (!input) return ['confirmed'];
  const statuses = String(input)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => CALENDAR_ALLOWED_STATUSES.has(s));
  return statuses.length > 0 ? statuses : ['confirmed'];
}

/**
 * GET /api/dashboard/provider
 * Aggregated stats, confirmed-booking calendar groups, and pending/confirmed lists.
 */
export const getProviderDashboard = async (req, res) => {
  try {
    const startDate = req.query.start_date ? String(req.query.start_date) : null;
    const endDate = req.query.end_date ? String(req.query.end_date) : null;
    const calendarStatuses = normalizeStatuses(req.query.statuses);
    const providerTimezone = req.query.timezone
      ? String(req.query.timezone)
      : 'UTC';
    const resolvedTimezone = safeTimezone(providerTimezone);
    const hasCalendarRange = Boolean(startDate && endDate);

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

    let calendarBookings = bookings;
    if (hasCalendarRange) {
      calendarBookings = bookings.filter((b) => {
        if (!calendarStatuses.includes(b.status)) return false;
        const dateParts = getDatePartsInTimezone(b.scheduled_at, resolvedTimezone);
        if (!dateParts) return false;
        return dateParts.dateKey >= startDate && dateParts.dateKey <= endDate;
      });
    }

    const dayMap = new Map();
    for (const b of calendarBookings) {
      if (!calendarStatuses.includes(b.status)) continue;
      const dateParts = getDatePartsInTimezone(b.scheduled_at, resolvedTimezone);
      if (!dateParts) continue;
      const day = dateParts.dateKey;
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day).push({
        id: b.id,
        status: b.status,
        scheduled_at: b.scheduled_at,
        scheduled_date: day,
        scheduled_time: dateParts.timeKey,
        total_price: Number(b.total_price) || 0,
        service_name: b.service?.name ?? null,
        customer_name: b.customer?.full_name ?? null,
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
        calendar_meta: {
          start_date: startDate,
          end_date: endDate,
          statuses: calendarStatuses,
          provider_timezone: resolvedTimezone,
          last_refreshed_at: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error('getProviderDashboard error:', err);
    res.status(500).json({ success: false, error: 'Failed to load provider dashboard' });
  }
};
export default { getProviderDashboard };
