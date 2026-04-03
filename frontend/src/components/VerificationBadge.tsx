import React from "react";
import { CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";

export type VerificationStatusType = "verified" | "pending" | "unverified" | "failed";

interface VerificationBadgeProps {
  status: VerificationStatusType;
  onClick?: () => void;
  className?: string;
}

const BADGE_CONFIG: Record<
  VerificationStatusType,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  verified: {
    label: "Verified",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    icon: <CheckCircle2 size={14} className="text-emerald-600" />,
  },
  pending: {
    label: "Pending",
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    icon: <Clock size={14} className="text-amber-600" />,
  },
  unverified: {
    label: "Unverified",
    bg: "bg-slate-50 border-slate-200",
    text: "text-slate-500",
    icon: <MinusCircle size={14} className="text-slate-400" />,
  },
  failed: {
    label: "Failed",
    bg: "bg-red-50 border-red-200",
    text: "text-red-700",
    icon: <XCircle size={14} className="text-red-600" />,
  },
};

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  status,
  onClick,
  className = "",
}) => {
  const config = BADGE_CONFIG[status] || BADGE_CONFIG.unverified;

  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      title={config.label}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all
        ${config.bg} ${config.text}
        ${onClick ? "cursor-pointer hover:shadow-sm hover:scale-105" : ""}
        ${className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};
