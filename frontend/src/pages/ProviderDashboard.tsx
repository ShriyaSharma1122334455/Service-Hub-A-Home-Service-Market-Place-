import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { Calendar, Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
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
    scheduled_date?: string | null;
    scheduled_time?: string | null;
    total_price: number;
    service_name: string | null;
    customer_name?: string | null;
  }>;
}

interface CalendarEvent {
  id: string;
  status: string;
  scheduled_at: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  total_price: number;
  service_name: string | null;
  customer_name?: string | null;
}

interface ProviderDashboardData {
  stats: DashboardStats;
  breakdown: { pending: BreakdownRow[]; confirmed: BreakdownRow[] };
  calendar: CalendarDay[];
  calendar_meta?: {
    start_date?: string | null;
    end_date?: string | null;
    statuses?: string[];
    provider_timezone?: string | null;
    last_refreshed_at?: string | null;
  };
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

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date) {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function shiftWeek(date: Date, delta: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta * 7);
  return d;
}

function getVisibleRange(view: "week" | "month", date: Date) {
  if (view === "week") {
    const start = getWeekStart(date);
    const end = getWeekEnd(date);
    return { start, end };
  }
  const monthStart = getMonthStart(date);
  const monthEnd = getMonthEnd(date);
  return {
    start: getWeekStart(monthStart),
    end: getWeekEnd(monthEnd),
  };
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 animate-pulse min-h-32 flex flex-col justify-between">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-slate-200" />
        <div className="h-4 w-24 rounded bg-slate-100" />
      </div>
      <div className="h-9 w-20 rounded-lg bg-slate-200" />
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
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [calendarStatuses, setCalendarStatuses] = useState<string[]>(["confirmed"]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const hasLoadedDashboard = useRef(false);
  const allCalendarStatuses = ["pending", "confirmed", "completed", "cancelled"] as const;

  const visibleRange = useMemo(
    () => getVisibleRange(calendarView, currentDate),
    [calendarView, currentDate],
  );
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const load = useCallback(async ({ calendarOnly = false, silent = false } = {}) => {
    if (!isProvider || !token) {
      setInitialLoading(false);
      setCalendarLoading(false);
      setData(null);
      hasLoadedDashboard.current = false;
      return;
    }
    if (!silent && !calendarOnly) {
      setInitialLoading(true);
      setError(null);
    }
    if (calendarOnly) {
      setCalendarLoading(true);
    }
    try {
      const params = new URLSearchParams({
        start_date: toDateKey(visibleRange.start),
        end_date: toDateKey(visibleRange.end),
        statuses: calendarStatuses.join(","),
        timezone,
      });
      const res = await fetch(`${API_BASE}/api/dashboard/provider?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Could not load dashboard.");
        if (!calendarOnly) {
          setData(null);
          hasLoadedDashboard.current = false;
        }
      } else {
        const next = json.data as ProviderDashboardData;
        setData((prev) => {
          if (calendarOnly && prev) {
            return {
              ...prev,
              calendar: next.calendar,
              calendar_meta: next.calendar_meta,
            };
          }
          return next;
        });
        setLastRefreshedAt(next.calendar_meta?.last_refreshed_at ?? new Date().toISOString());
        hasLoadedDashboard.current = true;
      }
    } catch {
      if (!silent) {
        setError("Network error. Check your connection and try again.");
      }
      if (!calendarOnly) {
        setData(null);
        hasLoadedDashboard.current = false;
      }
    } finally {
      if (!silent && !calendarOnly) setInitialLoading(false);
      if (calendarOnly) setCalendarLoading(false);
    }
  }, [isProvider, token, visibleRange, calendarStatuses, timezone]);

  useEffect(() => {
    const calendarOnly = hasLoadedDashboard.current;
    void load({ calendarOnly });
  }, [load]);

  useEffect(() => {
    if (!isProvider || !token) return undefined;
    const timer = window.setInterval(() => {
      void load({ calendarOnly: true, silent: true });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [isProvider, token, load]);

  const calendarItemsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of data?.calendar ?? []) {
      const events = [...day.items].sort((a, b) =>
        String(a.scheduled_at).localeCompare(String(b.scheduled_at)),
      );
      map.set(day.date, events);
    }
    return map;
  }, [data]);

  const calendarDays = useMemo(() => {
    const base = new Date(currentDate);
    const result: Date[] = [];
    if (calendarView === "week") {
      const start = getWeekStart(base);
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        result.push(d);
      }
      return result;
    }

    const monthStart = getMonthStart(base);
    const monthEnd = getMonthEnd(base);
    const gridStart = getWeekStart(monthStart);
    const gridEnd = getWeekEnd(monthEnd);
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [calendarView, currentDate]);

  const calendarRangeLabel = useMemo(() => {
    if (calendarView === "month") {
      return currentDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
    const start = getWeekStart(currentDate);
    const end = getWeekEnd(currentDate);
    return `${start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} - ${end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }, [calendarView, currentDate]);

  const providerTimezoneLabel = data?.calendar_meta?.provider_timezone ?? timezone;
  const statusCounts = useMemo(
    () => ({
      pending: data?.stats.pending ?? 0,
      confirmed: data?.stats.confirmed ?? 0,
      completed: data?.stats.completed ?? 0,
      cancelled: data?.stats.cancelled ?? 0,
    }),
    [data],
  );

  const visibleEventCount = useMemo(() => {
    return calendarDays.reduce((count, day) => {
      const events = calendarItemsByDate.get(toDateKey(day)) ?? [];
      return count + events.length;
    }, 0);
  }, [calendarDays, calendarItemsByDate]);

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

  const bookingRows = useMemo(() => {
    if (!data) return [];
    return [...data.breakdown.pending, ...data.breakdown.confirmed].sort((a, b) =>
      String(a.scheduled_at).localeCompare(String(b.scheduled_at)),
    );
  }, [data]);

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
            <p className="mt-1 text-xs text-slate-400">
              Local timezone: {timezone}
              {lastRefreshedAt ? ` · Last updated ${new Date(lastRefreshedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load({ calendarOnly: false })}
              disabled={initialLoading || calendarLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <Loader2 size={16} className={initialLoading || calendarLoading ? "animate-spin" : ""} />
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
              onClick={() => {
                void load();
              }}
              className="text-sm font-bold text-red-900 underline"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {initialLoading ? (
            Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : data ? (
            statCards.map((card) => (
              <div
                key={card.label}
                className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5 min-h-32 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                <div
                  className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${card.bg} opacity-10`}
                />
                <div className="relative z-10 flex items-center gap-2.5 min-h-9">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100 text-base">
                    {card.icon}
                  </span>
                  <p className="text-sm text-slate-600 font-semibold leading-tight">
                    {card.label}
                  </p>
                </div>
                <p className="relative z-10 mt-4 text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                  {card.value}
                </p>
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
                className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5 opacity-70 min-h-32 flex flex-col justify-between"
              >
                <div className="flex items-center gap-2.5 min-h-9">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100 text-base">
                    {card.icon}
                  </span>
                  <p className="text-sm text-slate-600 font-semibold leading-tight">
                    {card.label}
                  </p>
                </div>
                <p className="mt-4 text-3xl font-extrabold text-slate-300 tabular-nums leading-none">—</p>
              </div>
            ))
          )}
        </div>

        {!initialLoading && data && (
          <>
            <div className="grid grid-cols-1 gap-6">
              <BreakdownList
                title="Bookings"
                rows={bookingRows}
                emptyHint="No bookings yet."
              />
            </div>

            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-teal-600" />
                  <div>
                        <h2 className="text-base font-semibold text-slate-900">Calendar</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Showing times in your local timezone ({timezone})
                      {calendarLoading ? " · Updating..." : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarStatuses((prev) =>
                          prev.length === allCalendarStatuses.length
                            ? ["confirmed"]
                            : [...allCalendarStatuses],
                        )
                      }
                      className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                        calendarStatuses.length === allCalendarStatuses.length
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      All
                    </button>
                    {allCalendarStatuses.map((status) => {
                      const active = calendarStatuses.includes(status);
                      const dotClass =
                        status === "pending"
                          ? "bg-amber-400"
                          : status === "confirmed"
                            ? "bg-teal-500"
                            : status === "completed"
                              ? "bg-violet-500"
                              : "bg-rose-400";
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            setCalendarStatuses((prev) => {
                              const has = prev.includes(status);
                              if (has && prev.length === 1) return prev;
                              if (has) return prev.filter((s) => s !== status);
                              return [...prev, status];
                            })
                          }
                          className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1.5 ${
                            active
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                          <span className="capitalize">{status}</span>
                          <span className={`${active ? "text-white/80" : "text-slate-400"}`}>
                            {statusCounts[status]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentDate((prev) =>
                        calendarView === "month" ? shiftMonth(prev, -1) : shiftWeek(prev, -1),
                      )
                    }
                    aria-label="Previous calendar range"
                    title="Previous"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-semibold text-slate-700 min-w-[170px] text-center leading-none">
                    {calendarRangeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentDate((prev) =>
                        calendarView === "month" ? shiftMonth(prev, 1) : shiftWeek(prev, 1),
                      )
                    }
                    aria-label="Next calendar range"
                    title="Next"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                    </div>
                  <div className="ml-1 inline-flex h-7 rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCalendarView("week")}
                      className={`px-3 h-full text-xs font-semibold leading-none ${
                        calendarView === "week"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarView("month")}
                      className={`px-3 h-full text-xs font-semibold leading-none ${
                        calendarView === "month"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Month
                    </button>
                  </div>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {calendarLoading && (
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Loader2 size={14} className="animate-spin" />
                    Refreshing calendar...
                  </div>
                )}
                {calendarDays.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No scheduled bookings on the calendar.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-7 gap-2 mb-2">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dow) => (
                        <div
                          key={dow}
                          className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center"
                        >
                          {dow}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {calendarDays.map((day) => {
                        const dayKey = toDateKey(day);
                        const events = calendarItemsByDate.get(dayKey) ?? [];
                        const isOutsideMonth =
                          calendarView === "month" &&
                          day.getMonth() !== currentDate.getMonth();
                        const isToday = dayKey === toDateKey(new Date());
                        return (
                          <div
                            key={dayKey}
                            className={`min-h-28 rounded-xl border p-2 ${
                              isOutsideMonth
                                ? "bg-slate-50 border-slate-100"
                                : "bg-white border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`text-xs font-bold ${
                                  isToday ? "text-teal-700" : "text-slate-600"
                                }`}
                              >
                                {day.getDate()}
                              </span>
                              {events.length > 0 && (
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {events.length} booking{events.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            <div className="space-y-1">
                              {events.slice(0, 3).map((event) => {
                                const t = new Date(event.scheduled_at);
                                return (
                                  <button
                                    type="button"
                                    key={event.id}
                                    onClick={() => setSelectedEvent(event)}
                                    className="w-full text-left text-[11px] px-2 py-1 rounded-md border border-teal-100 bg-teal-50 hover:bg-teal-100/70"
                                  >
                                    <span className="font-semibold text-teal-800 block truncate">
                                      {event.service_name ?? "Service"}
                                    </span>
                                    <span className="text-teal-700">
                                      {t.toLocaleTimeString("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                        timeZone: providerTimezoneLabel,
                                      })}
                                    </span>
                                  </button>
                                );
                              })}
                              {events.length > 3 && (
                                <p className="text-[11px] text-slate-500 px-1">
                                  +{events.length - 3} more
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {visibleEventCount === 0 && (
                      <p className="mt-3 text-xs text-slate-500 text-center">
                        No confirmed bookings in this {calendarView} view yet.
                      </p>
                    )}
                    {selectedEvent && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-slate-900">
                            Booking details
                          </h3>
                          <button
                            type="button"
                            onClick={() => setSelectedEvent(null)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            Close
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <p className="text-slate-700">
                            <span className="font-semibold">Customer:</span>{" "}
                            {selectedEvent.customer_name ?? "Customer"}
                          </p>
                          <p className="text-slate-700">
                            <span className="font-semibold">Service:</span>{" "}
                            {selectedEvent.service_name ?? "Service"}
                          </p>
                          <p className="text-slate-700">
                            <span className="font-semibold">Status:</span> {selectedEvent.status}
                          </p>
                          <p className="text-slate-700">
                            <span className="font-semibold">When:</span>{" "}
                            {new Date(selectedEvent.scheduled_at).toLocaleString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: providerTimezoneLabel,
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
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
