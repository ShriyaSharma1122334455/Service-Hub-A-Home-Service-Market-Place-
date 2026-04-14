import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Star, DollarSign, Clock, X, Loader2 } from "lucide-react";
import type { User } from "../../types";
import fetchApi from "../lib/api";
import { readDamagePrefill, clearDamagePrefill } from "../lib/damagePrefill";

interface ServiceDetail {
  id: string;
  name: string;
  basePrice: number;
  durationMinutes: number;
  description: string;
  categorySlug: string;
}

interface ProviderCard {
  id: string;
  businessName: string;
  ratingAvg: number;
  ratingCount: number;
  fullName?: string | null;
  avatarUrl?: string | null;
  customPrice?: number | null;
  customDescription?: string | null;
}

function normalizeServiceDetail(raw: Record<string, unknown>): ServiceDetail | null {
  const id = raw.id ?? raw._id;
  if (id == null) return null;
  const category = raw.category as { slug?: string } | null | undefined;
  const legacyCat = raw.categoryId as { slug?: string } | null | undefined;
  return {
    id: String(id),
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    basePrice: Number(raw.base_price ?? raw.basePrice ?? 0),
    durationMinutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 0),
    categorySlug: category?.slug ?? legacyCat?.slug ?? "",
  };
}

function normalizeProviderCard(raw: Record<string, unknown>): ProviderCard {
  return {
    id: String(raw.id ?? raw._id ?? ""),
    businessName: String(raw.business_name ?? raw.businessName ?? ""),
    ratingAvg: Number(raw.rating_avg ?? raw.ratingAvg ?? 0),
    ratingCount: Number(raw.rating_count ?? raw.ratingCount ?? 0),
    fullName: (raw.full_name ?? raw.fullName) as string | null | undefined,
    avatarUrl: (raw.avatar_url ?? raw.avatarUrl) as string | null | undefined,
    customPrice: (raw.custom_price ?? raw.customPrice) as number | null | undefined,
    customDescription: (raw.custom_description ?? raw.customDescription) as
      | string
      | null
      | undefined,
  };
}

interface ServiceProvidersProps {
  serviceId: string;
  onNavigate: (path: string) => void;
  user?: User | null;
}

function defaultScheduledLocalValue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Only the top matches are listed; the API may return more. */
const MAX_PROVIDERS_SHOWN = 6;

const CATEGORY_ICONS: Record<string, string> = {
  cleaning: "✨",
  plumbing: "🔧",
  electrical: "⚡",
  "pest-control": "🐛",
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const ProviderSkeleton: React.FC = () => (
  <div className="glass-panel rounded-2xl p-6 animate-pulse">
    <div className="flex items-center gap-4 mb-4">
      <div className="w-16 h-16 rounded-full bg-slate-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-slate-200 rounded-full w-3/4" />
        <div className="h-3 bg-slate-200 rounded-full w-1/2" />
      </div>
    </div>
    <div className="space-y-2">
      <div className="h-3 bg-slate-200 rounded-full w-full" />
      <div className="h-3 bg-slate-200 rounded-full w-5/6" />
    </div>
    <div className="flex gap-2 mt-4">
      <div className="h-6 bg-slate-200 rounded-full w-20" />
      <div className="h-6 bg-slate-200 rounded-full w-16" />
    </div>
    <div className="h-9 bg-slate-200 rounded-full mt-4" />
  </div>
);

export const ServiceProviders: React.FC<ServiceProvidersProps> = ({
  serviceId,
  onNavigate,
  user = null,
}) => {
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [totalProviderCount, setTotalProviderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingProvider, setBookingProvider] = useState<ProviderCard | null>(
    null,
  );
  const [scheduledLocal, setScheduledLocal] = useState(() =>
    defaultScheduledLocalValue(),
  );
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const isCustomer =
    !!user && String(user.role).toLowerCase() === "customer";

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  const applyPrefill = useCallback(() => {
    const p = readDamagePrefill();
    if (!p?.job_description) return;
    if (p.service_id && p.service_id !== serviceId) return;
    setBookingNotes(p.job_description);
  }, [serviceId]);

  useEffect(() => {
    applyPrefill();
  }, [applyPrefill]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // All setState calls are inside this async function, not directly in the
    // effect body — satisfies react-hooks/set-state-in-effect lint rule.
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [svcData, provData] = await Promise.all([
          fetch(`${API_BASE}/api/services/${serviceId}`, { signal }).then((r) => r.json()),
          fetch(`${API_BASE}/api/providers/by-service/${serviceId}`, { signal }).then((r) => r.json()),
        ]);
        if (svcData.success && svcData.data) {
          const svc = normalizeServiceDetail(svcData.data as Record<string, unknown>);
          setService(svc);
          if (!svc) setError(true);
        } else {
          setService(null);
          setError(true);
        }
        if (provData.success && Array.isArray(provData.data)) {
          const all = provData.data.map((row: Record<string, unknown>) =>
            normalizeProviderCard(row),
          );
          setTotalProviderCount(all.length);
          const ranked = [...all].sort((a, b) => {
            if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
            return b.ratingCount - a.ratingCount;
          });
          setProviders(ranked.slice(0, MAX_PROVIDERS_SHOWN));
        } else {
          setProviders([]);
          setTotalProviderCount(0);
        }
      } catch {
        if (!signal.aborted) setError(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [serviceId, API_BASE]);

  const categorySlug = service?.categorySlug ?? "";
  const categoryIcon = CATEGORY_ICONS[categorySlug] ?? "🔧";

  const openBooking = (provider: ProviderCard) => {
    if (!isCustomer) {
      onNavigate("/login");
      return;
    }
    setBookingProvider(provider);
    setScheduledLocal(defaultScheduledLocalValue());
    applyPrefill();
    setBookingError(null);
    setBookingOpen(true);
  };

  const closeBooking = () => {
    setBookingOpen(false);
    setBookingProvider(null);
    setBookingError(null);
  };

  const submitBooking = async () => {
    if (!bookingProvider || !service) return;
    const iso = new Date(scheduledLocal).toISOString();
    if (Number.isNaN(new Date(scheduledLocal).getTime())) {
      setBookingError("Choose a valid date and time.");
      return;
    }
    setBookingSubmitting(true);
    setBookingError(null);
    const res = await fetchApi<unknown>("/bookings", {
      method: "POST",
      body: JSON.stringify({
        provider_id: bookingProvider.id,
        service_id: serviceId,
        scheduled_at: iso,
        notes: bookingNotes.trim() || undefined,
      }),
    });
    setBookingSubmitting(false);
    if (!res.success) {
      setBookingError(res.error || "Could not create booking.");
      return;
    }
    clearDamagePrefill();
    closeBooking();
    alert("Booking request submitted. You can track it from your profile.");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Back button */}
      <button
        onClick={() => onNavigate("/")}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-8"
      >
        <ArrowLeft size={16} />
        Back to Home
      </button>

      {/* Page header */}
      <div className="mb-10">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-slate-200 rounded-full w-1/3" />
            <div className="h-4 bg-slate-200 rounded-full w-1/4" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">⚠️</span>
            <p className="text-slate-700 font-semibold">Service not found</p>
            <p className="text-slate-400 text-sm mt-1">
              The service you're looking for doesn't exist or was removed.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">{categoryIcon}</span>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                {service?.name}
              </h1>
            </div>
            <p className="text-slate-500 font-medium">
              {totalProviderCount > 0 ? (
                <>
                  Showing {providers.length} of {totalProviderCount} provider
                  {totalProviderCount !== 1 ? "s" : ""}
                  {totalProviderCount > MAX_PROVIDERS_SHOWN && (
                    <span className="text-slate-400">
                      {" "}
                      (top-rated matches)
                    </span>
                  )}
                </>
              ) : (
                <>No providers available</>
              )}
              {service && totalProviderCount > 0 && (
                <span className="ml-2 text-slate-400">
                  · From ${service.basePrice} · {formatDuration(service.durationMinutes)}
                </span>
              )}
            </p>
          </>
        )}
      </div>

      {/* Provider grid */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProviderSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !error && providers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">🔍</span>
          <p className="text-slate-700 font-semibold text-lg">No providers available yet</p>
          <p className="text-slate-400 text-sm mt-2 max-w-xs">
            No providers are currently offering this service. Check back soon!
          </p>
        </div>
      )}

      {!loading && !error && providers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="glass-panel rounded-2xl p-6 flex flex-col hover:shadow-lg hover:bg-white/90 transition-all duration-300"
            >
              {/* Avatar + name row */}
              <div className="flex items-center gap-4 mb-4">
                {provider.avatarUrl ? (
                  <img
                    src={provider.avatarUrl}
                    alt={provider.businessName}
                    className="w-16 h-16 rounded-full object-cover flex-shrink-0 border-2 border-white shadow-sm"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 shadow-sm">
                    {provider.businessName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 leading-snug truncate">
                    {provider.businessName}
                  </h3>
                  {provider.fullName && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {provider.fullName}
                    </p>
                  )}
                  {/* Rating */}
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={12} className="fill-amber-400 text-amber-400" />
                    <span className="text-xs font-semibold text-slate-700">
                      {provider.ratingAvg.toFixed(1)}
                    </span>
                    {provider.ratingCount > 0 && (
                      <span className="text-xs text-slate-400">
                        ({provider.ratingCount} reviews)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-500 leading-relaxed line-clamp-3 flex-1 mb-4">
                {provider.customDescription ?? service?.description ?? ""}
              </p>

              {/* Price + duration chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                  <DollarSign size={11} />
                  From ${provider.customPrice ?? service?.basePrice ?? "—"}
                </span>
                {service && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">
                    <Clock size={11} />
                    {formatDuration(service.durationMinutes)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => openBooking(provider)}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm border transition-colors ${
                  isCustomer
                    ? "bg-teal-600 text-white border-teal-600 hover:bg-teal-700"
                    : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                }`}
              >
                {isCustomer ? "Book with provider" : "Sign in to book"}
              </button>
            </div>
          ))}
        </div>
      )}

      {bookingOpen && bookingProvider && service && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={closeBooking}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2
              id="booking-modal-title"
              className="text-lg font-bold text-slate-900 pr-10"
            >
              Request booking
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {bookingProvider.businessName} · {service.name}
            </p>

            <label className="block mt-6 text-sm font-semibold text-slate-800">
              Preferred date &amp; time
              <input
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <label className="block mt-4 text-sm font-semibold text-slate-800">
              Job details (from your assessment or edit below)
              <textarea
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={6}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                placeholder="Describe the work needed…"
              />
            </label>

            {bookingError && (
              <p className="mt-3 text-sm text-red-600">{bookingError}</p>
            )}

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={closeBooking}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitBooking}
                disabled={bookingSubmitting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 disabled:opacity-50"
              >
                {bookingSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit request"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
