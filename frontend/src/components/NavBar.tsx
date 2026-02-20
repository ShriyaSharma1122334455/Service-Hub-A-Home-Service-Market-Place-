import React, { useState } from "react";
import { UserRole } from "../../types";
import {
  Menu,
  X,
  HelpCircle,
  Settings,
  LogOut,
  CalendarCheck,
  LayoutDashboard,
} from "lucide-react";

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
  onOpenSupport,
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
              {user && user.role === UserRole.CUSTOMER && (
                <span
                  onClick={() => onNavigate("/search")}
                  className={navItemClass("/search")}
                >
                  Services
                </span>
              )}
              {user && user.role === UserRole.ADMIN && (
                <span
                  onClick={() => onNavigate("/admin")}
                  className={navItemClass("/admin")}
                >
                  Dashboard
                </span>
              )}
              {user && user.role === UserRole.PROVIDER && (
                <span
                  onClick={() => onNavigate("/dashboard")}
                  className={navItemClass("/dashboard")}
                >
                  Dashboard
                </span>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="hidden md:flex items-center">
            {user ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={onOpenSupport}
                  className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                  title="Support"
                >
                  <HelpCircle size={20} className="stroke-[2]" />
                </button>

                {user.role === UserRole.CUSTOMER && (
                  <span
                    onClick={() => onNavigate("/bookings")}
                    className={navItemClass("/bookings")}
                  >
                    <div className="flex items-center gap-2">
                      <CalendarCheck size={18} />
                      <span>Bookings</span>
                    </div>
                  </span>
                )}

                <div className="flex items-center gap-3 pl-4 border-l border-slate-200/60 ml-2">
                  <div
                    className="relative group cursor-pointer flex items-center gap-3"
                    onClick={() =>
                      user.role === UserRole.CUSTOMER && onNavigate("/profile")
                    }
                  >
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900 leading-tight">
                        {user.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {user.role === "CUSTOMER"
                          ? "Member"
                          : user.role === "ADMIN"
                            ? "Admin"
                            : "Pro"}
                      </div>
                    </div>
                    <img
                      src={user.avatar || "https://via.placeholder.com/32"}
                      alt="Avatar"
                      className="h-10 w-10 rounded-full border-2 border-white shadow-sm object-cover"
                    />
                  </div>

                  <div className="flex gap-1">
                    {user.role === UserRole.CUSTOMER && (
                      <button
                        onClick={() => onNavigate("/profile")}
                        className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all"
                        title="Settings"
                      >
                        <Settings size={20} className="stroke-[2]" />
                      </button>
                    )}

                    {(user.role === UserRole.ADMIN ||
                      user.role === UserRole.PROVIDER) && (
                      <button
                        onClick={() =>
                          onNavigate(
                            user.role === UserRole.ADMIN
                              ? "/admin"
                              : "/dashboard",
                          )
                        }
                        className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all"
                        title="Dashboard"
                      >
                        <LayoutDashboard size={20} className="stroke-[2]" />
                      </button>
                    )}

                    <button
                      onClick={onLogout}
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                      title="Sign Out"
                    >
                      <LogOut size={20} className="stroke-[2]" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
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
              </div>
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
            {user && user.role === UserRole.CUSTOMER && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onNavigate("/search");
                  setIsOpen(false);
                }}
              >
                Browse Services
              </div>
            )}

            {user && user.role === UserRole.ADMIN && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onNavigate("/admin");
                  setIsOpen(false);
                }}
              >
                Admin Dashboard
              </div>
            )}

            {user && user.role === UserRole.PROVIDER && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onNavigate("/dashboard");
                  setIsOpen(false);
                }}
              >
                Provider Dashboard
              </div>
            )}

            {user && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onNavigate("/bookings");
                  setIsOpen(false);
                }}
              >
                {user.role === UserRole.CUSTOMER ? "My Bookings" : "Schedule"}
              </div>
            )}
            {user && user.role === UserRole.CUSTOMER && (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                onClick={() => {
                  onNavigate("/profile");
                  setIsOpen(false);
                }}
              >
                Profile Settings
              </div>
            )}

            <div className="h-px bg-slate-200 my-2"></div>

            {!user ? (
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
            ) : (
              <div
                className="block px-4 py-3 rounded-2xl text-base font-semibold text-red-600 hover:bg-red-50"
                onClick={() => {
                  onLogout();
                  setIsOpen(false);
                }}
              >
                Sign Out
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
