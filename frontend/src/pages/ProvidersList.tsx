import React, { useState, useEffect } from "react";
import { profileService } from "../services/profile";
import type { BackendProvider } from "../services/profile";
import { ArrowLeft, User as UserIcon, Star, Loader2 } from "lucide-react";

interface ProvidersListProps {
  onNavigate: (path: string) => void;
}

export const ProvidersList: React.FC<ProvidersListProps> = ({ onNavigate }) => {
  const [providers, setProviders] = useState<BackendProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      const response = await profileService.listProviders();
      if (cancelled) return;
      if (response.success && response.data) {
        setProviders(response.data);
      } else {
        setError(response.error || "Failed to load providers");
      }
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

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

        <h1 className="text-3xl font-bold text-slate-900 mb-8">Providers</h1>

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
                <p className="text-sm text-slate-500 font-medium line-clamp-2">
                  {p.serviceCategory || p.description}
                </p>
              )}
            </button>
          ))}
        </div>

        {providers.length === 0 && (
          <p className="text-center text-slate-500 font-medium py-12">No providers found.</p>
        )}
      </div>
    </div>
  );
};
