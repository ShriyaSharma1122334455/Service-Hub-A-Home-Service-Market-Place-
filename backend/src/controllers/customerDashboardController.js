import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

// DB stores 'pending' and 'confirmed'; the API surface exposes both as 'upcoming'.
// 'cancelled' in DB maps directly to 'cancelled' in the response.
const UPCOMING_DB_STATUSES = ['pending', 'confirmed'];

const VALID_API_STATUSES = new Set(['upcoming', 'completed', 'cancelled']);

/** Maps a raw DB status string to the API-facing status label. */
function toApiStatus(dbStatus) {
  if (dbStatus === 'pending' || dbStatus === 'confirmed') return 'upcoming';
  return dbStatus; // 'completed' | 'cancelled' pass through unchanged
}

/**
 * GET /api/dashboard/customer
 * Returns aggregated booking stats and a filtered bookings list for the
 * authenticated customer.
 *
 * Query params:
 *   ?status=  upcoming | completed | cancelled | all (default: all)
 *   ?search=  case-insensitive substring match on provider business_name
 */
export const getCustomerDashboard = async (req, res) => {
  try {
    // ── Step 1: resolve internal user ─────────────────────────────────────
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    // ── Step 2: parse query params ─────────────────────────────────────────
    const rawStatus = String(req.query.status ?? '').trim().toLowerCase();
    const search    = String(req.query.search ?? '').trim().toLowerCase();
    const statusFilter = VALID_API_STATUSES.has(rawStatus) ? rawStatus : null;

    // ── Step 3: build queries ──────────────────────────────────────────────
    //
    // Stats query: fetch only 'status' for every booking this customer owns.
    // We need all rows (no status filter) to compute accurate totals.
    //
    // List query: fetch full booking details with service + provider joins.
    // Apply DB-level status filter where possible; search is post-filtered
    // in JS because PostgREST cannot filter on related-table columns directly.
    //
    // Assumption: bookings.customer_id → users.id (internal pk, not supabase_id)
    // Assumption: bookings.service_id  → services.id  (alias: service)
    // Assumption: bookings.provider_id → providers.id (alias: provider)
    //   providers.business_name is the display name used across the app.

    const statsQuery = supabase
      .from('bookings')
      .select('status')
      .eq('customer_id', internalUser.id);

    let listQuery = supabase
      .from('bookings')
      .select('id, status, scheduled_at, service:services(name), provider:providers(business_name)')
      .eq('customer_id', internalUser.id)
      .order('scheduled_at', { ascending: true });

    // Apply DB-level status filter to reduce list payload
    if (statusFilter === 'upcoming') {
      listQuery = listQuery.in('status', UPCOMING_DB_STATUSES);
    } else if (statusFilter === 'completed') {
      listQuery = listQuery.eq('status', 'completed');
    } else if (statusFilter === 'cancelled') {
      listQuery = listQuery.eq('status', 'cancelled');
    }

    // ── Step 4: run both queries in parallel ───────────────────────────────
    const [statsResult, listResult] = await Promise.all([statsQuery, listQuery]);

    if (statsResult.error || listResult.error) {
      return res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }

    // ── Step 5: aggregate stats in JS ─────────────────────────────────────
    let upcoming = 0, pending = 0, completed = 0, cancelled = 0;
    for (const row of statsResult.data ?? []) {
      if (row.status === 'pending')   { upcoming += 1; pending += 1; }
      else if (row.status === 'confirmed') upcoming  += 1;
      else if (row.status === 'completed') completed += 1;
      else if (row.status === 'cancelled') cancelled += 1;
    }

    // ── Step 6: shape + filter bookings list ──────────────────────────────
    let bookings = (listResult.data ?? []).map((b) => ({
      id:           b.id,
      serviceName:  b.service?.name          ?? null,
      providerName: b.provider?.business_name ?? null,
      date:         b.scheduled_at,
      status:       toApiStatus(b.status),
    }));

    // Post-filter by provider name (case-insensitive substring)
    if (search) {
      bookings = bookings.filter((b) =>
        b.providerName?.toLowerCase().includes(search)
      );
    }

    // Cap list at 20 items (consistent with provider dashboard BREAKDOWN_LIMIT)
    bookings = bookings.slice(0, 20);

    // ── Step 7: return response ────────────────────────────────────────────
    return res.json({
      stats: {
        total:          (statsResult.data ?? []).length,
        upcoming,
        pending,
        completed,
        cancelled,
        scheduledSpend: 0,
      },
      bookings,
    });

  } catch (err) {
    console.error('getCustomerDashboard error:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

export default { getCustomerDashboard };
