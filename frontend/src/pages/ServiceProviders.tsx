import React, { useState, useEffect } from "react";
import { ArrowLeft, Star, DollarSign, Clock } from "lucide-react";

interface ServiceDetail {
  _id: string;
  name: string;
  basePrice: number;
  durationMinutes: number;
  description: string;
  subCategory?: string;
  categoryId?: { name: string; slug: string };
}

interface ProviderCard {
  _id: string;
  businessName: string;
  ratingAvg: number;
  ratingCount: number;
  fullName?: string;
  avatarUrl?: string;
  customPrice?: number | null;
  customDescription?: string | null;
}

interface ServiceProvidersProps {
  serviceId: string;
  onNavigate: (path: string) => void;
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
}) => {
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

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
        if (svcData.success) setService(svcData.data);
        if (provData.success) setProviders(provData.data);
        if (!svcData.success) setError(true);
      } catch {
        if (!signal.aborted) setError(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [serviceId, API_BASE]);

  const categorySlug = service?.categoryId?.slug ?? "";
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
              key={provider._id}
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

              {/* Book button — disabled, coming soon */}
              <div className="relative group/btn">
                <button
                  disabled
                  className="w-full py-2.5 rounded-xl bg-teal-50 text-teal-400 font-semibold text-sm border border-teal-100 cursor-not-allowed"
                >
                  Book with Provider
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 text-white text-[10px] font-semibold rounded-md whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none">
                  Coming Soon
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
