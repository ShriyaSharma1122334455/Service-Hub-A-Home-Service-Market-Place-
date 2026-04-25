import type { FC } from "react";
import { Search, X } from "lucide-react";

export type BookingTab = "all" | "upcoming" | "completed" | "cancelled";

const TABS: { value: BookingTab; label: string }[] = [
  { value: "all",       label: "All"       },
  { value: "upcoming",  label: "Upcoming"  },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

interface BookingFiltersProps {
  activeTab: BookingTab;
  onTabChange: (tab: BookingTab) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Defaults to "Search by provider..." */
  searchPlaceholder?: string;
}

export const BookingFilters: FC<BookingFiltersProps> = ({
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search by provider...",
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      {/* Tab bar — button style matches calendar status toggles in ProviderDashboard.tsx */}
      <div
        role="tablist"
        aria-label="Filter bookings by status"
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.value)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                active
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search input */}
      <div className="relative flex items-center sm:w-64">
        <Search
          size={15}
          className="absolute left-3 text-slate-400 pointer-events-none shrink-0"
        />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-colors"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
