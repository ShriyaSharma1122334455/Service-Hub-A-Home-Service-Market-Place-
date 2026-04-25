import type { FC } from "react";
import { Calendar } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { BookingStatus } from "./StatusBadge";

export interface BookingItem {
  id: string;
  serviceName: string | null;
  providerName: string | null;
  date: string; // ISO 8601 string from the API
  status: BookingStatus;
}

interface BookingsListProps {
  bookings: BookingItem[];
  loading?: boolean;
  emptyMessage?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Skeleton row mirrors SkeletonSkeleton pattern from ProviderDashboard.tsx
function SkeletonRow() {
  return (
    <li className="px-5 py-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="h-3 w-28 rounded bg-slate-100" />
        </div>
        <div className="hidden sm:flex items-center gap-6">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="h-5 w-20 rounded-full bg-slate-200" />
        </div>
      </div>
    </li>
  );
}

export const BookingsList: FC<BookingsListProps> = ({
  bookings,
  loading = false,
  emptyMessage = "No bookings found",
}) => {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/80">
        <h3 className="text-base font-semibold text-slate-900">Your Bookings</h3>
        {!loading && (
          <p className="text-[11px] text-slate-500 font-medium">
            {bookings.length} shown
          </p>
        )}
      </div>

      <ul className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
        ) : bookings.length === 0 ? (
          // Empty state — Calendar icon matches the existing icon library (Lucide)
          <li className="px-5 py-12 flex flex-col items-center gap-3 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <Calendar size={24} className="text-slate-400" />
            </span>
            <p className="text-sm font-semibold text-slate-700">No bookings yet</p>
            <p className="text-xs text-slate-400 max-w-xs">{emptyMessage}</p>
          </li>
        ) : (
          bookings.map((b) => (
            <li
              key={b.id}
              className="px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
            >
              {/* Desktop: single row. Mobile: service name + provider on top, date + badge below */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 text-sm truncate">
                    {b.serviceName ?? "Service"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {b.providerName ?? "Provider"}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:gap-6 flex-wrap sm:flex-nowrap shrink-0">
                  <p className="text-xs text-slate-400 whitespace-nowrap">
                    {formatDate(b.date)}
                  </p>
                  <StatusBadge status={b.status} />
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
};
