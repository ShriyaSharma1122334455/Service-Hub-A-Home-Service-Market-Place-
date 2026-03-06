import React, { useState, useEffect } from "react";
import { UserRole } from "../../types";
import { Lock, Mail, User, Briefcase } from "lucide-react";

interface LoginProps {
  onLogin: (email: string, role: UserRole, password?: string) => void;
  onRegisterClick: () => void;
}

const isDev = import.meta.env.DEV;
const USER_CREDENTIALS = isDev ? { email: "user@test.com", password: "userpass" } : null;
const PROVIDER_CREDENTIALS = isDev ? { email: "provider@test.com", password: "providerpass" } : null;

export const Login: React.FC<LoginProps> = ({ onLogin, onRegisterClick }) => {
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [email, setEmail] = useState(USER_CREDENTIALS?.email ?? "");
  const [password, setPassword] = useState(USER_CREDENTIALS?.password ?? "");

  useEffect(() => {
    if (role === UserRole.PROVIDER && PROVIDER_CREDENTIALS) {
      setEmail(PROVIDER_CREDENTIALS.email);
      setPassword(PROVIDER_CREDENTIALS.password);
    } else if (USER_CREDENTIALS) {
      setEmail(USER_CREDENTIALS.email);
      setPassword(USER_CREDENTIALS.password);
    }
  }, [role]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim()) {
      onLogin(email, role, password);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-8 transform hover:scale-105 transition-transform duration-500">
            <div className="h-16 w-16 bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-3xl tracking-tighter">
                S
              </span>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
            Welcome back
          </h2>
          <p className="mt-2 text-slate-500 font-medium">
            Don't have an account?{" "}
            <button
              onClick={onRegisterClick}
              className="font-bold text-slate-900 hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>

        <div className="glass-panel py-10 px-6 sm:px-10 rounded-[3rem]">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-3">
                Sign in as
              </label>
              <div className="flex gap-4">
                <label className="flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50 border-slate-200 hover:border-slate-300">
                  <input
                    type="radio"
                    name="role"
                    value={UserRole.CUSTOMER}
                    checked={role === UserRole.CUSTOMER}
                    onChange={() => setRole(UserRole.CUSTOMER)}
                    className="sr-only"
                  />
                  <User className="h-6 w-6 text-slate-500" />
                  <span className="font-semibold text-slate-800">User (Customer)</span>
                </label>
                <label className="flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50 border-slate-200 hover:border-slate-300">
                  <input
                    type="radio"
                    name="role"
                    value={UserRole.PROVIDER}
                    checked={role === UserRole.PROVIDER}
                    onChange={() => setRole(UserRole.PROVIDER)}
                    className="sr-only"
                  />
                  <Briefcase className="h-6 w-6 text-slate-500" />
                  <span className="font-semibold text-slate-800">Provider</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-300" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input block w-full pl-11 pr-4 py-4 rounded-2xl text-sm font-bold text-slate-900"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-300" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input block w-full pl-11 pr-4 py-4 rounded-2xl text-sm font-bold text-slate-900"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 px-4 rounded-full shadow-xl text-base font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 shadow-slate-900/10"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
