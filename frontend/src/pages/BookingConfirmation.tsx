import React, { useState, useEffect } from "react";
import { CheckCircle, Calendar, Clock, User, Loader2, ArrowLeft, Home } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingDetail {
  id: string;
  status: string;
  scheduled_at: string;
  total_price: number;
  notes?: string | null;
  service?: { name: string; base_price?: number } | null;
  provider?: { business_name: string } | null;
}

interface BookingConfirmationProps {
  bookingId: string;
  token: string;
  onNavigate: (path: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pending Provider Acceptance", color: "text-amber-700",  bg: "bg-amber-50 border-amber-100" },
  confirmed: { label: "Confirmed",                   color: "text-teal-700",   bg: "bg-teal-50 border-teal-100" },
  cancelled: { label: "Cancelled",                   color: "text-red-700",    bg: "bg-red-50 border-red-100" },
  completed: { label: "Completed",                   color: "text-slate-700",  bg: "bg-slate-50 border-slate-200" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const BookingConfirmation: React.FC<BookingConfirmationProps> = ({
  bookingId,
  token,
  onNavigate,
}) => {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/bookings/${bookingId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) {
          if (json.success && json.data) {
            setBooking(json.data as BookingDetail);
          } else {
            setError(true);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [bookingId, token]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Loading your booking…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !booking) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="glass-panel rounded-[2.5rem] p-10 text-center max-w-md">
          <span className="text-5xl block mb-4">⚠️</span>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Booking not found</h2>
          <p className="text-slate-500 text-sm mb-6">
            We couldn't load the booking details. Your booking may still have been created.
          </p>
          <button
            onClick={() => onNavigate("/")}
            className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const scheduled = new Date(booking.scheduled_at);
  const statusCfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG["pending"];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-5">

        {/* Success hero */}
        <div className="glass-panel rounded-[2.5rem] p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4 shadow-md shadow-teal-100">
            <CheckCircle className="w-10 h-10 text-teal-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Booking Requested!</h1>
          <p className="text-slate-500 text-sm">
            Your booking has been submitted and is awaiting provider confirmation.
          </p>
        </div>

        {/* Status badge */}
        <div className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 ${statusCfg.bg}`}>
          <span className={`text-sm font-bold ${statusCfg.color}`}>
            Status: {statusCfg.label}
          </span>
        </div>

        {/* Booking details card */}
        <div className="glass-panel rounded-[2rem] divide-y divide-slate-100 overflow-hidden">

          <div className="flex items-start gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-base">🔧</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Service</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {booking.service?.name ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <User size={15} className="text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Provider</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {booking.provider?.business_name ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Calendar size={15} className="text-sky-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {scheduled.toLocaleDateString("en-US", {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Clock size={15} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Time</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {scheduled.toLocaleTimeString("en-US", {
                  hour: "numeric", minute: "2-digit", hour12: true,
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-4 bg-slate-50">
            <p className="text-sm font-bold text-slate-700">Estimated Total</p>
            <p className="text-lg font-extrabold text-teal-700">${booking.total_price}</p>
          </div>
        </div>

        {/* Booking ID */}
        <p className="text-center text-xs text-slate-400">
          Booking ID: <span className="font-mono">{booking.id}</span>
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate("/")}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            <Home size={15} />
            Home
          </button>
          <button
            onClick={() => onNavigate("/my-bookings")}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all active:scale-[0.98]"
          >
            <ArrowLeft size={15} />
            View My Bookings
          </button>
        </div>
      </div>
    </div>
  );
};
