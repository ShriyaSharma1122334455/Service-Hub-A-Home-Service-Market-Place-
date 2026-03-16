import type { User, Provider } from "../../types";

interface ProviderDashboardProps {
  user: User | Provider | null;
  onNavigate: (path: string) => void;
}

const STAT_CARDS = [
  {
    label: "Active Bookings",
    value: "—",
    icon: "📅",
    bg: "from-teal-500 to-emerald-500",
  },
  {
    label: "Total Earnings",
    value: "—",
    icon: "💰",
    bg: "from-violet-500 to-purple-600",
  },
  {
    label: "Avg Rating",
    value: "—",
    icon: "⭐",
    bg: "from-amber-400 to-orange-500",
  },
  {
    label: "Total Reviews",
    value: "—",
    icon: "💬",
    bg: "from-sky-500 to-blue-600",
  },
];

const QUICK_ACTIONS = [
  { label: "Manage Services", icon: "🛠️", description: "Add, edit or remove your offered services" },
  { label: "View Schedule", icon: "🗓️", description: "See upcoming and past appointments" },
  { label: "Customer Reviews", icon: "⭐", description: "Read and respond to customer reviews" },
  { label: "Earnings Report", icon: "📊", description: "Track your revenue and payouts" },
  { label: "Update Profile", icon: "👤", description: "Edit your business info and photos" },
  { label: "Availability", icon: "🕐", description: "Set your working hours and off days" },
];

export const ProviderDashboard: React.FC<ProviderDashboardProps> = ({
  user,
  onNavigate,
}) => {
  const displayName = user?.name || "Provider";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-teal-600 uppercase tracking-wider mb-1">
              Provider Portal
            </p>
            <h1 className="text-3xl font-extrabold text-slate-900">
              Welcome back, {displayName} 👋
            </h1>
            <p className="mt-1 text-slate-500 text-sm">
              Your dashboard will show live stats and tools here once booking goes live.
            </p>
          </div>
          <button
            onClick={() => onNavigate("/")}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
          >
            ← Browse Home
          </button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm p-5"
            >
              <div
                className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${card.bg} opacity-10`}
              />
              <span className="text-2xl">{card.icon}</span>
              <p className="mt-3 text-2xl font-extrabold text-slate-800">
                {card.value}
              </p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {card.label}
              </p>
              <span className="absolute bottom-3 right-3 text-[10px] font-semibold text-slate-300 uppercase tracking-widest">
                Coming Soon
              </span>
            </div>
          ))}
        </div>

        {/* Coming Soon Banner */}
        <div className="rounded-2xl border border-dashed border-teal-300 bg-teal-50/60 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center text-2xl shrink-0">
            🚀
          </div>
          <div>
            <h2 className="font-bold text-teal-900 text-base">
              Full Provider Dashboard — Coming Soon
            </h2>
            <p className="text-teal-700 text-sm mt-0.5 leading-relaxed">
              Booking management, real-time earnings, customer messaging, and
              availability scheduling are actively being built. You'll be able to
              run your entire business from this dashboard.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {QUICK_ACTIONS.map((action) => (
              <div
                key={action.label}
                className="group relative flex items-start gap-4 rounded-2xl bg-white border border-slate-100 shadow-sm p-5 cursor-not-allowed opacity-70"
                title="Coming soon"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0 group-hover:bg-teal-50 transition-colors">
                  {action.icon}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">
                    {action.label}
                  </p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {action.description}
                  </p>
                </div>
                <span className="absolute top-3 right-3 text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                  Soon
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
