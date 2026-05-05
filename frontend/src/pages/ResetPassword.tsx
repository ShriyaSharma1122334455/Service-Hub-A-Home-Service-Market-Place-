import React, { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";

interface ResetPasswordProps {
  onNavigate: (path: string) => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ onNavigate }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!passwordRegex.test(password)) {
      setStatus("error");
      setMessage("Password must be at least 8 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special character.");
      return;
    }
    setStatus("loading");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(error.message || "Failed to reset password. The link may have expired.");
    } else {
      setStatus("success");
      setMessage("Password reset successfully! Redirecting to login...");
      await supabase.auth.signOut();
      setTimeout(() => onNavigate("/login"), 2500);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-8 transform hover:scale-105 transition-transform duration-500">
            <div className="h-16 w-16 bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-3xl tracking-tighter">S</span>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-slate-900 tracking-tight">Set new password</h2>
          <p className="mt-2 text-slate-500 font-medium">Enter your new password below.</p>
        </div>

        <div className="glass-panel py-10 px-6 sm:px-10 rounded-[3rem]">
          {status === "success" ? (
            <p className="text-green-600 text-center font-semibold">{message}</p>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {status === "error" && (
                <p className="text-red-600 text-sm font-medium text-center bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {message}
                </p>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-300" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="glass-input block w-full pl-11 pr-12 py-4 rounded-2xl text-sm font-bold text-slate-900"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-300" />
                  </div>
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`glass-input block w-full pl-11 pr-12 py-4 rounded-2xl text-sm font-bold text-slate-900 ${
                      passwordsMismatch ? "border border-red-400" : passwordsMatch ? "border border-green-400" : ""
                    }`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {passwordsMismatch && (
                  <p className="mt-2 ml-4 text-xs font-semibold text-red-500">Passwords do not match.</p>
                )}
                {passwordsMatch && (
                  <p className="mt-2 ml-4 text-xs font-semibold text-green-600">Passwords match.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={status === "loading" || passwordsMismatch}
                className="w-full py-4 px-4 rounded-full shadow-xl text-base font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 shadow-slate-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "loading" ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
