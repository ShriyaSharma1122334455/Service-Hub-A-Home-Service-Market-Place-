import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import { Calendar, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import type { User, Provider } from "../../types";
import { UserRole } from "../../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

interface DashboardStats {
  total_bookings: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  total_earnings: number;
}

interface BreakdownRow {
  id: string;
  status: string;
  scheduled_at: string;
  total_price: number;
  service_name: string | null;
  customer_name: string | null;
}

interface CalendarDay {
  date: string;
  items: Array<{
    id: string;
    status: string;
    scheduled_at: string;
    total_price: number;
    service_name: string | null;
  }>;
}

interface ProviderDashboardData {
  stats: DashboardStats;
  breakdown: { pending: BreakdownRow[]; confirmed: BreakdownRow[] };
  calendar: CalendarDay[];
}

interface ProviderDashboardProps {
  user: User | Provider | null;
  token: string;
  onNavigate: (path: string) => void;
}

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatUsdCents(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 animate-pulse">
      <div className="h-6 w-6 rounded bg-slate-200" />
      <div className="mt-4 h-8 w-16 rounded-lg bg-slate-200" />
      <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
    </div>
  );
}

function BreakdownList({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: BreakdownRow[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/80">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="text-[11px] text-slate-500 font-medium">{rows.length} shown</p>
      </div>
      <ul className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-slate-400">{emptyHint}</li>
        ) : (
          rows.map((row) => {
            const when = new Date(row.scheduled_at);
            return (
              <li key={row.id} className="px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">
                      {row.service_name ?? "Service"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {row.customer_name ?? "Customer"} ·{" "}
                      {when.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-teal-700 shrink-0">
                    {formatUsd(row.total_price)}
                  </span>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export const ProviderDashboard: FC<ProviderDashboardProps> = ({
  user,
  token,
  onNavigate,
}) => {
  const displayName = user?.name || "Provider";
  const isProvider =
    user && String(user.role).toUpperCase() === UserRole.PROVIDER;

  const [data, setData] = useState<ProviderDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isProvider || !token) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/provider`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Could not load dashboard.");
        setData(null);
      } else {
        setData(json.data as ProviderDashboardData);
      }
    } catch {
      setError("Network error. Check your connection and try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isProvider, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const upcomingCalendar = useMemo(() => {
    if (!data?.calendar?.length) return [];
    const today = new Date().toISOString().slice(0, 10);
    return data.calendar.filter((d) => d.date >= today).slice(0, 10);
  }, [data]);

  const statCards = useMemo(() => {
    if (!data) return [];
    const { stats } = data;
    return [
      {
        label: "Total bookings",
        value: String(stats.total_bookings),
        icon: "📋",
        bg: "from-slate-500 to-slate-700",
      },
      {
        label: "Pending requests",
        value: String(stats.pending),
        icon: "⏳",
        bg: "from-amber-400 to-orange-500",
      },
      {
        label: "Confirmed",
        value: String(stats.confirmed),
        icon: "✅",
        bg: "from-teal-500 to-emerald-600",
      },
      {
        label: "Completed",
        value: String(stats.completed),
        icon: "✨",
        bg: "from-violet-500 to-purple-600",
      },
      {
        label: "Total earnings",
        value: formatUsdCents(stats.total_earnings),
        icon: "💰",
        bg: "from-emerald-500 to-teal-600",
      },
    ];
  }, [data]);

  const isEmpty =
    data && data.stats.total_bookings === 0 && !loading && !error;

  if (!isProvider) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-16 px-4">
        <div className="max-w-lg mx-auto text-center rounded-2xl bg-white border border-slate-100 shadow-sm p-10">
          <p className="text-slate-600 text-sm mb-4">
            The provider dashboard is only available for provider accounts.
          </p>
          <button
            type="button"
            onClick={() => onNavigate("/")}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-teal-600 uppercase tracking-wider mb-1">
              Provider portal
            </p>
            <h1 className="text-3xl font-extrabold text-slate-900">
              Welcome back, {displayName}
            </h1>
            <p className="mt-1 text-slate-500 text-sm">
              Live booking stats and your near-term schedule.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <Loader2 size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => onNavigate("/")}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
            >
              Browse home
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <AlertCircle className="text-red-500 shrink-0" size={22} />
            <p className="text-sm text-red-800 font-medium flex-1">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-sm font-bold text-red-900 underline"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : data ? (
            statCards.map((card) => (
              <div
                key={card.label}
                className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm p-5"
              >
                <div
                  className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${card.bg} opacity-10`}
                />
                <span className="text-2xl">{card.icon}</span>
                <p className="mt-3 text-2xl font-extrabold text-slate-800 tabular-nums">
                  {card.value}
                </p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</p>
              </div>
            ))
          ) : (
            [
              { label: "Total bookings", icon: "📋" },
              { label: "Pending requests", icon: "⏳" },
              { label: "Confirmed", icon: "✅" },
              { label: "Completed", icon: "✨" },
              { label: "Total earnings", icon: "💰" },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 opacity-60"
              >
                <span className="text-2xl">{card.icon}</span>
                <p className="mt-3 text-2xl font-extrabold text-slate-300 tabular-nums">—</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</p>
              </div>
            ))
          )}
        </div>

        {isEmpty && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-10 text-center">
            <span className="text-4xl" aria-hidden>
              📭
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-800">No bookings yet</h2>
            <p className="mt-2 text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
              When customers book your services, requests and confirmations will show up
              here with live counts and your schedule.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("/")}
              className="mt-6 inline-flex items-center gap-1 text-teal-700 font-bold text-sm hover:underline"
            >
              Browse marketplace
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {!loading && data && !isEmpty && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakdownList
                title="Pending requests"
                rows={data.breakdown.pending}
                emptyHint="No pending requests."
              />
              <BreakdownList
                title="Confirmed bookings"
                rows={data.breakdown.confirmed}
                emptyHint="No confirmed bookings yet."
              />
            </div>

            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-2">
                <Calendar size={18} className="text-teal-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">Calendar</h2>
                  <p className="text-xs text-slate-500">
                    Upcoming days with scheduled work (from today)
                  </p>
                </div>
              </div>
              <div className="p-5">
                {upcomingCalendar.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No upcoming scheduled bookings on the calendar.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {upcomingCalendar.map((day) => (
                      <li key={day.date}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <ul className="space-y-2 pl-0">
                          {day.items.map((item) => {
                            const t = new Date(item.scheduled_at);
                            return (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-3 text-sm bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100"
                              >
                                <span className="text-slate-700 font-medium truncate">
                                  {item.service_name ?? "Service"}{" "}
                                  <span className="text-slate-400 font-normal">
                                    · {t.toLocaleTimeString("en-US", {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </span>
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                                    item.status === "pending"
                                      ? "bg-amber-100 text-amber-800"
                                      : item.status === "confirmed"
                                        ? "bg-teal-100 text-teal-800"
                                        : "bg-slate-200 text-slate-700"
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => onNavigate("/my-bookings")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors shadow-md"
              >
                Manage all bookings
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        )}

        <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 p-6">
          <h2 className="font-bold text-teal-900 text-sm">More dashboard tools</h2>
          <p className="text-teal-800/90 text-xs mt-1 leading-relaxed">
            Earnings reports, availability editing, and messaging will layer in here as they
            ship. Booking stats and your calendar above are live today.
          </p>
        </div>
      </div>
    </div>
  );
};
