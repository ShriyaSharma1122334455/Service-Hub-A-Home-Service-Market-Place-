import React, { useState } from "react";
import { UserRole } from "../../types";
import { Menu, X, LogOut } from "lucide-react";

interface NavbarProps {
  user: { name: string; role: UserRole; avatar?: string } | null;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  currentPath: string;
  onOpenSupport: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onNavigate,
  currentPath,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const navItemClass = (path: string) => `
    px-5 py-2.5 rounded-full text-sm font-semibold cursor-pointer transition-all duration-300
    ${
      currentPath === path
        ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
        : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
    }
  `;

  return (
    <nav className="sticky top-4 z-50 px-4 mb-4">
      <div className="max-w-7xl mx-auto">
        <div className="glass-panel rounded-full px-6 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo Section */}
          <div className="flex items-center gap-8">
            <div
              className="flex-shrink-0 flex items-center cursor-pointer group gap-2.5"
              onClick={() => onNavigate("/")}
            >
              <div className="h-10 w-10 bg-gradient-to-br from-slate-900 to-slate-700 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300">
                <span className="text-white font-bold text-xl tracking-tighter">
                  S
                </span>
              </div>
              <span className="font-bold text-xl text-slate-900 tracking-tight hidden md:block">
                ServiceHub
              </span>
            </div>

            <div className="hidden md:flex items-center space-x-1">
              <span
                onClick={() => onNavigate("/")}
                className={navItemClass("/")}
              >
                Home
              </span>
              {user?.role === UserRole.PROVIDER && (
                <span
                  onClick={() => onNavigate("/users")}
                  className={navItemClass("/users")}
                >
                  Users
                </span>
              )}
              {user?.role === UserRole.CUSTOMER && (
                <span
                  onClick={() => onNavigate("/providers")}
                  className={navItemClass("/providers")}
                >
                  Providers
                </span>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-4 bg-white/40 pl-2 pr-4 py-1.5 rounded-full border border-white/60">
                <button
                  onClick={() => onNavigate("/profile/me")}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <img
                    src={user.avatar}
                    alt=""
                    className="w-8 h-8 rounded-full border border-white shadow-sm"
                  />
                  <span className="text-sm font-bold text-slate-800">
                    {user.name}
                  </span>
                </button>
                <button
                  onClick={onLogout}
                  className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onNavigate("/login")}
                  className="text-slate-600 hover:text-slate-900 px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:bg-slate-100"
                >
                  Log In
                </button>
                <button
                  onClick={() => onNavigate("/register")}
                  className="bg-slate-900 text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-800 hover:scale-105 transition-all shadow-lg shadow-slate-900/20"
                >
                  Get Started
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden mt-2 glass-panel rounded-3xl overflow-hidden p-2 absolute left-4 right-4 shadow-xl z-50">
          <div className="space-y-1">
            <div
              className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => {
                onNavigate("/");
                setIsOpen(false);
              }}
            >
              Home
            </div>
            {user?.role === UserRole.PROVIDER && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onNavigate("/users");
                  setIsOpen(false);
                }}
              >
                Users
              </div>
            )}
            {user?.role === UserRole.CUSTOMER && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onNavigate("/providers");
                  setIsOpen(false);
                }}
              >
                Providers
              </div>
            )}
            {user && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onNavigate("/profile/me");
                  setIsOpen(false);
                }}
              >
                My Profile
              </div>
            )}
            <div className="h-px bg-slate-200 my-2"></div>
            {user ? (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-red-600 hover:bg-red-50"
                onClick={() => {
                  onLogout();
                  setIsOpen(false);
                }}
              >
                Log Out
              </div>
            ) : (
              <>
                <div
                  className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    onNavigate("/login");
                    setIsOpen(false);
                  }}
                >
                  Log In
                </div>
                <div
                  className="block px-4 py-3 rounded-2xl text-base font-semibold text-teal-600 hover:bg-teal-50"
                  onClick={() => {
                    onNavigate("/register");
                    setIsOpen(false);
                  }}
                >
                  Create Account
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
