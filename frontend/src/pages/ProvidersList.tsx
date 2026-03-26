import React, { useState, useEffect } from "react";
import { ArrowLeft, User as UserIcon, Star, Loader2, MapPin } from "lucide-react";
import { searchService } from "../services/search";
import type { BackendProvider } from "../services/profile";
import { SearchBar } from "../components/SearchBar";
import type { SearchFilters } from "../components/SearchBar";
import { useDebounce } from "../hooks/useDebounce";

interface ProvidersListProps {
  onNavigate: (path: string) => void;
}

// Known service categories seeded in the app
const CATEGORIES = ["Plumbing", "Electrician", "Cleaning", "Pest Control"];

export const ProvidersList: React.FC<ProvidersListProps> = ({ onNavigate }) => {
  const [providers, setProviders] = useState<BackendProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<SearchFilters>({
    keyword: "",
    location: "",
    category: "",
  });

  // Debounce text inputs — avoid a request on every keystroke
  const debouncedKeyword = useDebounce(filters.keyword, 400);
  const debouncedLocation = useDebounce(filters.location, 400);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const response = await searchService.searchProviders({
        keyword: debouncedKeyword || undefined,
        location: debouncedLocation || undefined,
        category: filters.category || undefined,
      });

      if (cancelled) return;

      if (response.success && response.data) {
        setProviders(response.data.providers);
      } else {
        setError(response.error || "Failed to load providers");
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedKeyword, debouncedLocation, filters.category]);

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

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Find Providers</h1>

        <SearchBar
          filters={filters}
          categories={CATEGORIES}
          onChange={setFilters}
          resultCount={loading ? undefined : providers.length}
          loading={loading}
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
            <p className="mt-4 text-slate-500 font-medium">Searching providers…</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {providers.map((p) => (
                <button
                  key={p._id}
                  onClick={() => onNavigate(`/profile/${p._id}?type=provider`)}
                  className="glass-panel rounded-[2rem] p-6 text-left hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4 mb-4">
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt={p.fullName}
                        className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center">
                        <UserIcon className="h-7 w-7 text-slate-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 truncate">
                        {p.businessName || p.fullName || "Unknown"}
                      </p>
                      {(p.ratingAvg ?? p.rating) !== undefined && (
                        <div className="flex items-center gap-1 mt-1">
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                          <span className="text-sm font-semibold text-slate-700">
                            {(p.ratingAvg ?? p.rating)!.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {(p.serviceCategory || p.description) && (
                    <p className="text-sm text-slate-500 font-medium line-clamp-2 mb-3">
                      {p.serviceCategory || p.description}
                    </p>
                  )}

                  {p.location && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                      <MapPin className="h-3.5 w-3.5" />
                      {p.location}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {providers.length === 0 && (
              <p className="text-center text-slate-500 font-medium py-12">
                No providers found. Try adjusting your search.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
