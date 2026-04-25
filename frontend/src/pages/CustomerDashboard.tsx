import { useEffect, useState, type FC } from "react";
import { AlertCircle, RefreshCw, ChevronDown } from "lucide-react";
import type { User, Provider } from "../../types";
import { StatsCards } from "../components/StatsCards";
import type { CustomerStats } from "../components/StatsCards";
import { StatusBadge } from "../components/StatusBadge";
import type { BookingStatus } from "../components/StatusBadge";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const EMPTY_STATS: CustomerStats = {
  total: 0,
  upcoming: 0,
  pending: 0,
  completed: 0,
  cancelled: 0,
  scheduledSpend: 0,
};

const WARN_OPTIONS = [
  { value: "24",  label: "Start warnings 24 hours before" },
  { value: "48",  label: "Start warnings 48 hours before" },
  { value: "72",  label: "Start warnings 72 hours before" },
  { value: "168", label: "Start warnings 1 week before"   },
];

const WARN_LABELS: Record<string, string> = {
  "24":  "24-hour heads-up",
  "48":  "48-hour heads-up",
  "72":  "72-hour heads-up",
  "168": "1-week heads-up",
};

const POLICY_ITEMS = [
  {
    title: "Free cancellation",
    desc: "Cancel up to 24 hours before your appointment at no charge.",
  },
  {
    title: "Late cancellation",
    desc: "Cancellations within 24 hours may incur a fee set by the provider.",
  },
  {
    title: "No-show policy",
    desc: "Missed appointments without notice are charged the full service fee.",
  },
];

interface BookingItem {
  id: string;
  serviceName: string | null;
  providerName: string | null;
  date: string;
  status: BookingStatus;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

interface CustomerDashboardProps {
  user: User | Provider | null;
  token: string;
  onNavigate: (path: string) => void;
}

export const CustomerDashboard: FC<CustomerDashboardProps> = ({
  user,
  token,
  onNavigate,
}) => {
  const displayName = user?.name ?? "there";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [stats, setStats]                     = useState<CustomerStats>(EMPTY_STATS);
  const [bookings, setBookings]               = useState<BookingItem[]>([]);
  const [statsLoading, setStatsLoading]       = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [retryKey, setRetryKey]               = useState(0);
  const [warnHours, setWarnHours]             = useState("48");

  // Stats — fetched on mount and explicit retry only
  useEffect(() => {
    if (!token) { setStatsLoading(false); return; }
    setStatsLoading(true);
    fetch(`${API_BASE}/api/dashboard/customer`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.stats) setStats(json.stats as CustomerStats);
        else setError(json.error ?? "Failed to load dashboard.");
      })
      .catch(() => setError("Network error. Please check your connection."))
      .finally(() => setStatsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, retryKey]);

  // Upcoming bookings — fetched on mount and explicit retry only
  useEffect(() => {
    if (!token) { setBookingsLoading(false); return; }
    setBookingsLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/dashboard/customer?status=upcoming`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json.bookings)) setBookings(json.bookings as BookingItem[]);
        else { setError(json.error ?? "Failed to load bookings."); setBookings([]); }
      })
      .catch(() => { setError("Network error. Please check your connection."); setBookings([]); })
      .finally(() => setBookingsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, retryKey]);

  const handleRetry = () => { setError(null); setRetryKey((k) => k + 1); };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Page header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-teal-600 uppercase tracking-widest mb-1">
              Customer Dashboard
            </p>
            <h1 className="text-3xl font-bold text-slate-900">
              Your appointments, {displayName}
            </h1>
            <p className="mt-1 text-slate-500 text-sm">
              Track upcoming visits, manage cancellations, and set when the dashboard starts warning you.
            </p>
            <p className="mt-0.5 text-xs text-slate-400">Local timezone: {timezone}</p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => onNavigate("/")}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
            >
              Browse services
            </button>
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50/80 px-5 py-4 flex items-start gap-3">
            <AlertCircle className="text-orange-500 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-orange-900 font-medium flex-1">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-sm font-bold text-orange-900 underline shrink-0"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Stats cards ──────────────────────────────────────────────────────── */}
        <StatsCards stats={stats} loading={statsLoading} />

        {/* ── Two-column: schedule + warning timeframe ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Appointment schedule */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900">Appointment schedule</h2>
            <p className="text-sm text-slate-500 mt-0.5 mb-5">
              Your next confirmed or pending visits appear here.
            </p>

            {bookingsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-base font-semibold text-slate-800">
                  No appointments scheduled yet
                </p>
                <p className="text-sm text-slate-500 mt-2 max-w-xs leading-relaxed">
                  When you book a service, your timeline, warning window, and cancellation
                  controls will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate("/")}
                  className="mt-5 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors shadow-sm"
                >
                  Find a service
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {bookings.map((b) => (
                  <li key={b.id} className="py-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {b.serviceName ?? "Service"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {b.providerName ?? "Provider"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <p className="text-xs text-slate-400 whitespace-nowrap">
                          {formatDate(b.date)}
                        </p>
                        <StatusBadge status={b.status} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Warning timeframe */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900">Warning timeframe</h2>
            <p className="text-sm text-slate-500 mt-1">
              Choose when the dashboard should start surfacing stronger alerts for upcoming
              appointments.
            </p>
            <div className="mt-5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Alert window
              </label>
              <div className="relative">
                <select
                  value={warnHours}
                  onChange={(e) => setWarnHours(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2.5 pr-9 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 cursor-pointer"
                >
                  {WARN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
              <div className="mt-4 rounded-xl bg-teal-50 border border-teal-100 p-4">
                <p className="text-sm font-semibold text-teal-900">
                  Current setting: {WARN_LABELS[warnHours]}
                </p>
                <p className="text-xs text-teal-700 mt-1.5 leading-relaxed">
                  This setting changes dashboard warnings only, so you can choose how early
                  you want the schedule to start nudging you.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Appointment policy ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900">Appointment policy</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">
            Review cancellation and rescheduling rules that apply to your bookings.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {POLICY_ITEMS.map((p) => (
              <div
                key={p.title}
                className="rounded-xl bg-slate-50 border border-slate-100 p-4"
              >
                <p className="text-sm font-semibold text-slate-800">{p.title}</p>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
