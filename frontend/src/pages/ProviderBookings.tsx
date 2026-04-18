import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Calendar,
  Clock,
  User,
  AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingRow {
  id: string;
  status: string;
  scheduled_at: string;
  total_price: number;
  notes?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  service?: { name: string } | null;
  // customer info joined from users via customer_id (not always present)
  customer?: { full_name?: string; email?: string } | null;
}

interface ProviderBookingsProps {
  token: string;
  onNavigate: (path: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  pending:   { label: "Pending",   dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-100" },
  confirmed: { label: "Confirmed", dot: "bg-teal-500",   badge: "bg-teal-50 text-teal-700 border-teal-100" },
  cancelled: { label: "Cancelled", dot: "bg-red-400",    badge: "bg-red-50 text-red-700 border-red-100" },
  completed: { label: "Completed", dot: "bg-slate-400",  badge: "bg-slate-100 text-slate-600 border-slate-200" },
};

const FILTERS = ["all", "pending", "confirmed", "completed", "cancelled"] as const;
type Filter = typeof FILTERS[number];

// ─── Component ────────────────────────────────────────────────────────────────

export const ProviderBookings: React.FC<ProviderBookingsProps> = ({
  token,
  onNavigate,
}) => {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // Per-row action state
  const [actionLoading, setActionLoading] = useState<Record<string, "accept" | "reject" | null>>({});
  const [actionError, setActionError] = useState<Record<string, string | null>>({});

  // ── Fetch bookings ─────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Failed to load bookings.");
      } else {
        setBookings(Array.isArray(json.data) ? json.data : []);
      }
    } catch {
      setError("Network error. Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ── Accept / Reject ────────────────────────────────────────────────────────
  async function handleAction(bookingId: string, action: "accept" | "reject") {
    setActionLoading((prev) => ({ ...prev, [bookingId]: action }));
    setActionError((prev) => ({ ...prev, [bookingId]: null }));

    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/${action}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: action === "reject" ? JSON.stringify({ reason: "Declined by provider" }) : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError((prev) => ({
          ...prev,
          [bookingId]: json.error || `Failed to ${action} booking.`,
        }));
      } else {
        // Optimistically update the local row
        const newStatus = action === "accept" ? "confirmed" : "cancelled";
        setBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
        );
      }
    } catch {
      setActionError((prev) => ({
        ...prev,
        [bookingId]: "Network error. Please try again.",
      }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [bookingId]: null }));
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered =
    filter === "all"
      ? bookings
      : bookings.filter((b) => b.status === filter);

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] = f === "all" ? bookings.length : bookings.filter((b) => b.status === f).length;
    return acc;
  }, {});

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate("/dashboard/provider")}
              className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">Incoming Bookings</h1>
              <p className="text-sm text-slate-500">
                {counts["pending"]} pending · {bookings.length} total
              </p>
            </div>
          </div>
          <button
            onClick={fetchBookings}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold transition-colors px-3 py-1.5 rounded-full hover:bg-slate-200"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`
                flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all
                ${filter === f
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50"}
              `}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {counts[f] > 0 && (
                <span
                  className={`ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    filter === f ? "bg-white/20" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle size={40} className="text-red-400 mb-3" />
            <p className="text-slate-700 font-semibold">{error}</p>
            <button
              onClick={fetchBookings}
              className="mt-4 px-5 py-2 bg-slate-900 text-white rounded-full text-sm font-bold hover:bg-slate-800 transition-all"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">📭</span>
            <p className="text-slate-700 font-semibold">
              No {filter === "all" ? "" : filter} bookings
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {filter === "pending"
                ? "No pending requests right now."
                : "Nothing to show here."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((booking) => {
              const cfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG["pending"];
              const scheduled = new Date(booking.scheduled_at);
              const isPending = booking.status === "pending";
              const rowLoading = actionLoading[booking.id];
              const rowError = actionError[booking.id];

              return (
                <div
                  key={booking.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono truncate max-w-[120px]">
                      #{booking.id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Card body */}
                  <div className="px-5 py-4 space-y-3">
                    {/* Service */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-base">🔧</span>
                      <span className="font-bold text-slate-900">
                        {booking.service?.name ?? "Service"}
                      </span>
                      <span className="ml-auto font-extrabold text-teal-700">
                        ${booking.total_price}
                      </span>
                    </div>

                    {/* Customer */}
                    {booking.customer && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <User size={14} className="text-slate-400" />
                        <span>
                          {booking.customer.full_name ?? booking.customer.email ?? "Customer"}
                        </span>
                      </div>
                    )}

                    {/* Date + time */}
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-400" />
                        {scheduled.toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400" />
                        {scheduled.toLocaleTimeString("en-US", {
                          hour: "numeric", minute: "2-digit", hour12: true,
                        })}
                      </div>
                    </div>

                    {/* Address */}
                    {(booking.address_street || booking.address_city) && (
                      <p className="text-xs text-slate-500">
                        📍{" "}
                        {[
                          booking.address_street,
                          booking.address_city,
                          booking.address_state,
                          booking.address_zip,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}

                    {/* Notes */}
                    {booking.notes && (
                      <p className="text-xs text-slate-500 italic bg-slate-50 rounded-lg px-3 py-2">
                        "{booking.notes}"
                      </p>
                    )}

                    {/* Row error */}
                    {rowError && (
                      <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                        {rowError}
                      </div>
                    )}

                    {/* Accept / Reject — only for pending */}
                    {isPending && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleAction(booking.id, "reject")}
                          disabled={!!rowLoading}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {rowLoading === "reject" ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <XCircle size={14} />
                          )}
                          Reject
                        </button>
                        <button
                          onClick={() => handleAction(booking.id, "accept")}
                          disabled={!!rowLoading}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 transition-colors shadow-md shadow-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {rowLoading === "accept" ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle size={14} />
                          )}
                          Accept
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
