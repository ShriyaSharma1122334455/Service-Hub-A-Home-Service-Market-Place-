import React, { useState, useEffect, useCallback } from "react";
import { X, Clock, DollarSign, ChevronRight, Star, Search, User as UserIcon } from "lucide-react";
import type { User, Provider } from "../../types";

/** Normalized from Supabase (`id`, `base_price`, …) for UI use */
interface ServiceRow {
  id: string;
  name: string;
  description: string;
  base_price: number;
  duration_minutes: number;
  sub_category?: string;
  provider_id?: string;
  provider_name?: string;
  provider_rating_avg?: number;
  provider_rating_count?: number;
}

function normalizeService(raw: Record<string, unknown>): ServiceRow {
  const sub =
    (raw.sub_category as string | null | undefined) ??
    (raw.subCategory as string | undefined);
  const prov = raw.provider as Record<string, unknown> | null | undefined;
  return {
    id: String(raw.id ?? raw._id ?? ""),
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    base_price: Number(raw.base_price ?? raw.basePrice ?? 0),
    duration_minutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 0),
    sub_category: sub || undefined,
    provider_id: prov ? String(prov.id ?? "") : undefined,
    provider_name: prov ? String(prov.business_name ?? "") : undefined,
    provider_rating_avg: prov ? Number(prov.rating_avg ?? 0) : undefined,
    provider_rating_count: prov ? Number(prov.rating_count ?? 0) : undefined,
  };
}

interface ServiceCatalogModalProps {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  onClose: () => void;
  user: User | Provider | null;
  onNavigate: (path: string) => void;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const SkeletonCard: React.FC = () => (
  <div className="flex gap-4 p-5 rounded-2xl bg-white/60 animate-pulse">
    <div className="w-14 h-14 rounded-xl bg-slate-200 flex-shrink-0" />
    <div className="flex-1 space-y-3">
      <div className="h-4 bg-slate-200 rounded-full w-3/5" />
      <div className="h-3 bg-slate-200 rounded-full w-full" />
      <div className="h-3 bg-slate-200 rounded-full w-4/5" />
      <div className="flex gap-2 mt-1">
        <div className="h-6 bg-slate-200 rounded-full w-20" />
        <div className="h-6 bg-slate-200 rounded-full w-16" />
      </div>
    </div>
  </div>
);

export const ServiceCatalogModal: React.FC<ServiceCatalogModalProps> = ({
  categoryId,
  categoryName,
  categoryIcon,
  onClose,
  user,
  onNavigate,
}) => {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  // Debounce: wait 350ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Re-fetch whenever category or debounced search changes
  useEffect(() => {
    setLoading(true);
    setError(false);

    const url = new URL(`${API_BASE}/api/services`);
    url.searchParams.set("category", categoryId);
    if (debouncedSearch) url.searchParams.set("search", debouncedSearch);

    fetch(url.toString())
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setServices(data.data.map((row: Record<string, unknown>) => normalizeService(row)));
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [categoryId, debouncedSearch, API_BASE]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // Group services by subCategory
  const grouped = services.reduce<Record<string, ServiceRow[]>>(
    (acc, svc) => {
      const key = svc.sub_category || "General";
      (acc[key] ??= []).push(svc);
      return acc;
    },
    {}
  );

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Panel */}
      <div className="w-full max-w-2xl glass-panel rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{categoryIcon}</span>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{categoryName}</h2>
              <p className="text-sm text-slate-500">
                {loading
                  ? "Loading services…"
                  : `${services.length} service${services.length !== 1 ? "s" : ""} available${debouncedSearch ? " (filtered)" : ""}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-7 py-3 border-b border-white/60 flex-shrink-0">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search in ${categoryName}…`}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-slate-50 border border-slate-200
                         focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent
                         placeholder:text-slate-400 text-slate-800 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Auth notice strip — shown only when logged out and services loaded */}
        {!user && !loading && !error && services.length > 0 && (
          <div className="px-7 py-2.5 bg-amber-50 border-b border-amber-100">
            <p className="text-xs text-amber-700 font-medium">
              🔒 Log in to view available providers and book a service
            </p>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 py-5 space-y-6">

          {/* Loading skeletons */}
          {loading && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">⚠️</span>
              <p className="text-slate-700 font-semibold">Failed to load services</p>
              <p className="text-slate-400 text-sm mt-1">Please try again later.</p>
            </div>
          )}

          {/* Empty state — no services in category */}
          {!loading && !error && services.length === 0 && !debouncedSearch && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">🔧</span>
              <p className="text-slate-700 font-semibold">No services listed yet</p>
              <p className="text-slate-400 text-sm mt-1">Check back soon — more services are coming!</p>
            </div>
          )}

          {/* Empty state — search returned nothing */}
          {!loading && !error && services.length === 0 && debouncedSearch && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">🔍</span>
              <p className="text-slate-700 font-semibold">No results for "{debouncedSearch}"</p>
              <p className="text-slate-400 text-sm mt-1">Try a different keyword or clear the search.</p>
            </div>
          )}

          {/* Grouped service sections */}
          {!loading && !error && Object.entries(grouped).map(([subCat, svcs]) => (
            <div key={subCat}>

              {/* SubCategory heading */}
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">
                {subCat}
              </h3>

              <div className="space-y-3">
                {svcs.map((service) => (
                  <div
                    key={service.id}
                    className="group flex gap-4 p-5 rounded-2xl bg-white/60 hover:bg-white/90 border border-white/60 hover:border-teal-100 transition-all duration-300 hover:shadow-md"
                  >
                    {/* Left — icon */}
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                      {categoryIcon}
                    </div>

                    {/* Right — details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-slate-900 text-base leading-snug">
                          {service.name}
                        </h4>

                        {/* Auth-aware action button */}
                        {user ? (
                          <button
                            onClick={() => {
                              onClose();
                              onNavigate(`/book/${service.id}`);
                            }}
                            className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                          >
                            View Providers
                            <ChevronRight size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              onClose();
                              onNavigate("/login");
                            }}
                            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
                          >
                            Login to Select
                          </button>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                        {service.description}
                      </p>

                      {/* Chips row */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                          <DollarSign size={11} />
                          From ${service.base_price}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">
                          <Clock size={11} />
                          {formatDuration(service.duration_minutes)}
                        </span>
                        {service.provider_name && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">
                            <UserIcon size={11} />
                            {service.provider_name}
                          </span>
                        )}
                        {service.provider_rating_avg !== undefined && service.provider_rating_avg > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                            <Star size={11} className="fill-amber-500 text-amber-500" />
                            {service.provider_rating_avg.toFixed(1)}
                            {service.provider_rating_count && service.provider_rating_count > 0 && (
                              <span className="text-amber-500 font-normal">({service.provider_rating_count})</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
