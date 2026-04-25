import React from "react";
import { Clock, CheckCircle2, XCircle } from "lucide-react";

export type BookingStatus = "upcoming" | "completed" | "cancelled";

// Mirrors the BADGE_CONFIG pattern in VerificationBadge.tsx
const BADGE_CONFIG: Record<
  BookingStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  upcoming: {
    label: "Upcoming",
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    icon: <Clock size={14} className="text-amber-600" />,
  },
  completed: {
    label: "Completed",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    icon: <CheckCircle2 size={14} className="text-emerald-600" />,
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-red-50 border-red-200",
    text: "text-red-700",
    icon: <XCircle size={14} className="text-red-600" />,
  },
};

interface StatusBadgeProps {
  status: BookingStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = "" }) => {
  const config = BADGE_CONFIG[status] ?? BADGE_CONFIG.upcoming;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};
