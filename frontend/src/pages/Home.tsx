import React from "react";
import { ServiceCategory } from "../../types";
import type { User, Provider } from "../../types";
import { Star, ArrowRight } from "lucide-react";

const SERVICE_ICONS: Record<string, string> = {
  [ServiceCategory.CLEANING]: "✨",
  [ServiceCategory.PLUMBING]: "🔧",
  [ServiceCategory.ELECTRICAL]: "⚡",
  [ServiceCategory.INTERIOR_DESIGN]: "🎨",
};

interface HomeProps {
  onNavigate: (path: string) => void;
  user: User | Provider | null;
}

export const Home: React.FC<HomeProps> = () => {
  return (
    <div className="flex flex-col min-h-[calc(100vh-100px)]">
      <section className="relative py-20 lg:py-32 overflow-visible">
        <div className="relative max-w-5xl mx-auto px-4 text-center z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 border border-white/60 shadow-sm backdrop-blur-md mb-8 animate-float">
            <Star size={14} className="text-amber-500 fill-amber-500" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Trusted by 10k+ Homeowners
            </span>
          </div>
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold text-slate-900 tracking-tighter mb-8 leading-[0.95]">
            Home services, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-500">
              perfected.
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-xl text-slate-500 mb-12 leading-relaxed font-medium">
            Connect with top-rated professionals for cleaning, repairs, and
            design. Instant booking, transparent pricing.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button className="bg-slate-900 text-white px-8 py-4 rounded-full font-bold text-lg shadow-xl hover:bg-slate-800 hover:scale-105 transition-all flex items-center justify-center gap-2">
              Get Started Free <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </section>

      <section className="py-10 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 px-2">
            Explore Categories
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Object.values(ServiceCategory).map((service) => (
              <div
                key={service}
                className="group glass-panel rounded-[2.5rem] p-8 text-center cursor-pointer hover:bg-white/80 hover:scale-[1.02] transition-all duration-500 flex flex-col items-center justify-center h-64 relative overflow-hidden"
              >
                <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-500 opacity-70 group-hover:opacity-100">
                  {SERVICE_ICONS[service]}
                </div>
                <h3 className="font-bold text-slate-800 text-lg tracking-tight relative z-10">
                  {service}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mt-auto py-12 border-t border-slate-200/50 text-center">
        <div className="flex justify-center mb-6">
          <div className="h-10 w-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold">
            S
          </div>
        </div>
        <p className="text-slate-400 text-sm font-medium">
          © 2024 ServiceHub Inc. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
