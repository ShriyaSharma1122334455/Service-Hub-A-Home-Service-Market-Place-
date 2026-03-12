import React, { useState } from "react";
import { UserRole } from "../../types";
import { Lock, Mail, User } from "lucide-react";

interface RegisterProps {
  onRegister: (email: string, role: UserRole, password?: string) => void;
  onLoginClick: () => void;
}

export const Register: React.FC<RegisterProps> = ({
  onRegister,
  onLoginClick,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Pass selected role to the registration handler
    onRegister(email, role, password);
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
            Create account
          </h2>
          <p className="mt-2 text-slate-500 font-medium">
            Already have an account?{" "}
            <button
              onClick={onLoginClick}
              className="font-bold text-slate-900 hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>

        <div className="glass-panel py-10 px-6 sm:px-10 rounded-[3rem]">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-3">
                Register as
              </label>
              <div className="ml-4">
                <div className="inline-flex bg-slate-100 p-1 rounded-full shadow-sm">
                  <button
                    type="button"
                    onClick={() => setRole(UserRole.CUSTOMER)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      role === UserRole.CUSTOMER
                        ? "bg-white text-slate-900 shadow"
                        : "text-slate-600"
                    }`}
                    aria-pressed={role === UserRole.CUSTOMER}
                  >
                    User
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole(UserRole.PROVIDER)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      role === UserRole.PROVIDER
                        ? "bg-white text-slate-900 shadow"
                        : "text-slate-600"
                    }`}
                    aria-pressed={role === UserRole.PROVIDER}
                  >
                    Provider
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-300" />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input block w-full pl-11 pr-4 py-4 rounded-2xl text-sm font-bold text-slate-900"
                  placeholder="John Doe"
                />
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
              Sign Up
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
