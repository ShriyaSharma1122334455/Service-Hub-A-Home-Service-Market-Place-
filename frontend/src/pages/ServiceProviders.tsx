import React, { useState, useEffect } from "react";
import { ArrowLeft, Star, DollarSign, Clock, ExternalLink } from "lucide-react";
import { BookingModal } from "../components/BookingModal";

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
  user?: { role?: string } | null;
  /** Supabase access token — required to open BookingModal */
  token?: string;
}

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
  user,
  token,
}) => {
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Booking modal state
  const [bookingTarget, setBookingTarget] = useState<{
    providerId: string;
    providerName: string;
  } | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

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
          setProviders(
            provData.data.map((row: Record<string, unknown>) =>
              normalizeProviderCard(row),
            ),
          );
        } else {
          setProviders([]);
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
              {providers.length} provider{providers.length !== 1 ? "s" : ""} available
              {service && (
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
                    className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-md">
                    {provider.businessName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-base leading-snug truncate">
                    {provider.businessName}
                  </h3>
                  {provider.fullName && (
                    <p className="text-xs text-slate-500 truncate">{provider.fullName}</p>
                  )}
                  {/* Star rating */}
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={12} className="text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold text-slate-700">
                      {provider.ratingAvg > 0 ? provider.ratingAvg.toFixed(1) : "New"}
                    </span>
                    {provider.ratingCount > 0 && (
                      <span className="text-xs text-slate-400">
                        ({provider.ratingCount})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
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

              {/* Action buttons */}
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => onNavigate(`/profile/${provider.id}?type=provider`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 text-slate-600 font-semibold text-sm border border-slate-100 hover:bg-slate-100 transition-colors"
                >
                  <ExternalLink size={13} />
                  View Profile
                </button>
                <button
                  onClick={() => {
                    if (!user) {
                      onNavigate("/login");
                      return;
                    }
                    setBookingTarget({
                      providerId: provider.id,
                      providerName: provider.businessName,
                    });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 transition-colors shadow-md shadow-teal-100 active:scale-[0.98]"
                >
                  Book
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Booking Modal */}
      {bookingTarget && service && token && (
        <BookingModal
          providerId={bookingTarget.providerId}
          providerName={bookingTarget.providerName}
          serviceId={service.id}
          serviceName={service.name}
          servicePrice={service.basePrice}
          token={token}
          onClose={() => setBookingTarget(null)}
          onSuccess={(bookingId) => {
            setBookingTarget(null);
            onNavigate(`/booking-confirmation/${bookingId}`);
          }}
        />
      )}
    </div>
  );
};
