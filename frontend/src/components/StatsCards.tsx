import type { FC } from "react";
import { CalendarDays, Bell, ShieldCheck, CreditCard } from "lucide-react";

export interface CustomerStats {
  total: number;
  upcoming: number;
  pending: number;
  completed: number;
  cancelled: number;
  scheduledSpend?: number;
}

interface CardDef {
  label: string;
  Icon: FC<{ size?: number; className?: string }>;
  getValue: (s: CustomerStats) => string;
  blob: string;
  icon: string;
}

const CARDS: CardDef[] = [
  {
    label: "Upcoming appointments",
    Icon: CalendarDays,
    getValue: (s) => String(s.upcoming),
    blob: "bg-emerald-100",
    icon: "text-emerald-500",
  },
  {
    label: "Awaiting provider",
    Icon: Bell,
    getValue: (s) => String(s.pending),
    blob: "bg-amber-100",
    icon: "text-amber-500",
  },
  {
    label: "Can still cancel",
    Icon: ShieldCheck,
    getValue: (s) => String(s.upcoming),
    blob: "bg-green-100",
    icon: "text-green-500",
  },
  {
    label: "Scheduled spend",
    Icon: CreditCard,
    getValue: (s) => `$${(s.scheduledSpend ?? 0).toFixed(2)}`,
    blob: "bg-blue-100",
    icon: "text-blue-500",
  },
];

interface StatsCardsProps {
  stats: CustomerStats;
  loading?: boolean;
}

export const StatsCards: FC<StatsCardsProps> = ({ stats, loading = false }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white border border-slate-100 shadow-sm animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map(({ label, Icon, getValue, blob, icon }) => (
        <div key={label} className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
          <div className={`absolute -top-8 -right-8 h-28 w-28 rounded-full ${blob} opacity-75`} />
          <Icon size={18} className={`relative z-10 ${icon}`} />
          <p className="relative z-10 mt-3 text-sm text-slate-500 leading-snug">{label}</p>
          <p className="relative z-10 mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {getValue(stats)}
          </p>
        </div>
      ))}
    </div>
  );
};
