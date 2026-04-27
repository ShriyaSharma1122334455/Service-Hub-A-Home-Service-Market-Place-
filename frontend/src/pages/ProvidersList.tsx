import React, { useState, useEffect } from "react";
import type { BackendProvider } from "../services/profile";
import { ArrowLeft, User as UserIcon, Star, Loader2, Search, X } from "lucide-react";

interface ProvidersListProps {
  onNavigate: (path: string) => void;
}

export const ProvidersList: React.FC<ProvidersListProps> = ({ onNavigate }) => {
  const [providers, setProviders] = useState<BackendProvider[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [minRating, setMinRating] = useState("");

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  // Load categories once for the dropdown
  useEffect(() => {
    fetch(`${API_BASE}/api/categories`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) setCategories(data.data);
      })
      .catch(() => {});
  }, [API_BASE]);

  // Debounce search term 350ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Re-fetch when any filter changes
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const hasFilter = debouncedSearch || selectedCategory || minRating;
        const url = new URL(`${API_BASE}/api/providers${hasFilter ? "/search" : ""}`);
        if (debouncedSearch)    url.searchParams.set("search", debouncedSearch);
        if (selectedCategory)   url.searchParams.set("category", selectedCategory);
        if (minRating)          url.searchParams.set("minRating", minRating);
        url.searchParams.set("limit", "50");

        const res = await fetch(url.toString());
        const data = await res.json();
        if (cancelled) return;

        if (data.success) {
          // /api/providers/search wraps in data.providers; /api/providers uses data directly
          const list: BackendProvider[] = Array.isArray(data.data?.providers)
            ? data.data.providers
            : Array.isArray(data.data)
              ? data.data
              : [];
          setProviders(list);
        } else {
          setError(data.error || "Failed to load providers");
        }
      } catch {
        if (!cancelled) setError("Network error — please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [debouncedSearch, selectedCategory, minRating, API_BASE]);

  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setSelectedCategory("");
    setMinRating("");
  };

  const hasActiveFilters = !!(searchTerm || selectedCategory || minRating);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
        <p className="mt-4 text-slate-500 font-medium">Loading providers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4">
        <div className="glass-panel p-8 rounded-[3rem] text-center max-w-md">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => onNavigate("/")}
            className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-140px)] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => onNavigate("/")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium mb-8 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Browse Providers</h1>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by business name…"
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl bg-white border border-slate-200
                         focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent
                         placeholder:text-slate-400 text-slate-800 transition shadow-sm"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-xl bg-white border border-slate-200
                       focus:outline-none focus:ring-2 focus:ring-teal-400 text-slate-700 transition shadow-sm min-w-[160px]"
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* Min rating */}
          <select
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-xl bg-white border border-slate-200
                       focus:outline-none focus:ring-2 focus:ring-teal-400 text-slate-700 transition shadow-sm min-w-[140px]"
          >
            <option value="">Any rating</option>
            <option value="4">4+ stars</option>
            <option value="3">3+ stars</option>
            <option value="2">2+ stars</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200
                         text-slate-600 hover:bg-slate-50 transition whitespace-nowrap shadow-sm"
            >
              Clear filters
            </button>
          )}
        </div>

        <p className="text-sm text-slate-500 mb-4 font-medium">
            {providers.length} provider{providers.length !== 1 ? "s" : ""} found
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"></div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => onNavigate(`/profile/${p.id}?type=provider`)}
              className="glass-panel rounded-[2rem] p-6 text-left hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="flex items-center gap-4 mb-4">
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt={p.full_name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center">
                    <UserIcon className="h-7 w-7 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 truncate">
                    {p.business_name || p.full_name || "Unknown"}
                  </p>
                  {(p.rating_avg ?? p.rating) !== undefined && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-semibold text-slate-700">
                        {(p.rating_avg ?? p.rating)!.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {(p.serviceCategory || p.description) && (
                <p className="text-sm text-slate-500 font-medium line-clamp-2">
                  {p.serviceCategory || p.description}
                </p>
              )}
            </button>
          ))}
        </div>

        {!loading && !error && providers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">🔍</span>
            <p className="text-slate-700 font-semibold text-lg">
              {hasActiveFilters ? "No providers match your filters" : "No providers found"}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-4 text-sm text-teal-600 hover:underline font-medium">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
