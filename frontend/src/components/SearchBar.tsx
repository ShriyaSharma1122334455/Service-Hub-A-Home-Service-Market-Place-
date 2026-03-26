import React from 'react';
import { Search, MapPin, Tag, X } from 'lucide-react';

export interface SearchFilters {
  keyword: string;
  location: string;
  category: string;
}

interface SearchBarProps {
  filters: SearchFilters;
  categories: string[];
  onChange: (filters: SearchFilters) => void;
  resultCount?: number;
  loading?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  filters,
  categories,
  onChange,
  resultCount,
  loading = false,
}) => {
  const update = (key: keyof SearchFilters, value: string) =>
    onChange({ ...filters, [key]: value });

  const clearAll = () => onChange({ keyword: '', location: '', category: '' });

  const hasActiveFilters =
    filters.keyword !== '' || filters.location !== '' || filters.category !== '';

  return (
    <div className="mb-8 space-y-3">
      {/* Inputs row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Keyword */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search providers..."
            value={filters.keyword}
            onChange={(e) => update('keyword', e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-900 placeholder-slate-400 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          />
        </div>

        {/* Location */}
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Location (e.g. New York, NY)"
            value={filters.location}
            onChange={(e) => update('location', e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-900 placeholder-slate-400 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          />
        </div>

        {/* Category */}
        <div className="relative sm:w-48">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <select
            value={filters.category}
            onChange={(e) => update('category', e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-900 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition appearance-none"
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-slate-500">
          {loading ? (
            <span className="animate-pulse">Searching…</span>
          ) : resultCount !== undefined ? (
            <span>
              <span className="font-semibold text-slate-700">{resultCount}</span>{' '}
              {resultCount === 1 ? 'provider' : 'providers'} found
            </span>
          ) : null}
        </p>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-800 font-medium transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
};
