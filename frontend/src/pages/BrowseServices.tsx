import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";
import type { User, Provider } from "../../types";

const API_BASE = "http://localhost:3000";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
}

interface ProviderSummary {
  id: string;
  business_name: string;
  rating_avg?: number;
  rating_count?: number;
}

interface Service {
  id: string;
  name: string;
  description: string;
  base_price: number;
  duration_minutes: number;
  sub_category?: string;
  category?: { name: string };
  provider?: ProviderSummary;
}

interface BrowseServicesProps {
  user: User | Provider | null;
  token: string;
  onNavigate: (path: string) => void;
}

export const BrowseServices: React.FC<BrowseServicesProps> = ({
  token,
  onNavigate,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");

  useEffect(() => {
    // Fetch categories
    fetch(`${API_BASE}/api/categories`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCategories(data.data);
        }
      })
      .catch((err) => console.error("Error fetching categories:", err));
  }, [token]);

  useEffect(() => {
    // Fetch services
    let url = `${API_BASE}/api/services?limit=100`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (activeCategoryId !== "all") url += `&category=${activeCategoryId}`;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setServices(data.data);
        } else {
          setServices([]);
        }
      })
      .catch((err) => console.error("Error fetching services:", err))
      .finally(() => setLoading(false));
  }, [search, activeCategoryId, token]);

  const renderSkeletons = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="animate-pulse bg-slate-100 rounded-2xl h-64"></div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header and Search */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Browse Services</h1>
            <p className="mt-2 text-slate-500 text-sm">Find and book the perfect service for your needs.</p>
          </div>
          <div className="w-full md:w-96 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input w-full pl-12 pr-4 py-3 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Categories Horizontal Row */}
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
          <button
            onClick={() => setActiveCategoryId("all")}
            className={`${
              activeCategoryId === "all"
                ? "bg-slate-900 text-white rounded-full px-4 py-2 text-sm font-bold"
                : "bg-slate-100 text-slate-600 rounded-full px-4 py-2 text-sm font-medium hover:bg-slate-200"
            } whitespace-nowrap shrink-0 transition-all`}
          >
            All Services
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`${
                activeCategoryId === cat.id
                  ? "bg-slate-900 text-white rounded-full px-4 py-2 text-sm font-bold"
                  : "bg-slate-100 text-slate-600 rounded-full px-4 py-2 text-sm font-medium hover:bg-slate-200"
              } whitespace-nowrap shrink-0 flex items-center gap-2 transition-all`}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </div>

        {/* Services Grid */}
        {loading ? (
          renderSkeletons()
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center glass-panel rounded-3xl">
            <p className="text-xl font-bold text-slate-800">No services found</p>
            <p className="text-slate-500 mt-2 max-w-sm">Try adjusting your search or category filter to find what you're looking for.</p>
            <button 
              onClick={() => { setSearch(""); setActiveCategoryId("all"); }}
              className="mt-6 px-6 py-2.5 bg-slate-900 text-white rounded-full text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <div key={service.id} className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap gap-2">
                      {service.category?.name && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                          {service.category.name}
                        </span>
                      )}
                      {service.sub_category && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[10px] font-bold uppercase tracking-wider">
                          {service.sub_category}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">
                      {service.name}
                    </h3>
                  </div>
                </div>
                
                <p className="text-sm text-slate-500 line-clamp-2">
                  {service.description}
                </p>

                {service.provider?.business_name && (
                  <p className="text-xs text-slate-400">
                    {service.provider.business_name}
                    {service.provider.rating_avg != null && (
                      <span className="ml-2 text-yellow-500">
                        ★ {Number(service.provider.rating_avg).toFixed(1)}
                      </span>
                    )}
                  </p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Price</span>
                    <span className="text-lg font-black text-slate-900">
                      From ${service.base_price}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Duration</span>
                    <span className="text-sm font-bold text-slate-700">
                      {service.duration_minutes >= 60 
                        ? `${Math.floor(service.duration_minutes / 60)} hr${service.duration_minutes % 60 ? ` ${service.duration_minutes % 60} min` : ''}` 
                        : `${service.duration_minutes} min`}
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={() => onNavigate(`/book/${service.id}`)}
                  className="bg-slate-900 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-slate-800 mt-auto"
                >
                  Book Now
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
