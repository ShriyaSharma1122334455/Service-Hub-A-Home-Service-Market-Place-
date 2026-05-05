import React, { useState, useEffect } from "react";
import { UserRole } from "../../types";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";

interface LoginProps {
  onLogin: (
    email: string,
    role: UserRole,
    password?: string,
  ) => Promise<{ success: boolean; message?: string }>;
  onRegisterClick: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onRegisterClick }) => {
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [notification, setNotification] = useState<{
    message: string;
    type: "error";
  } | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [forgotMessage, setForgotMessage] = useState("");

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 20000); // 20 seconds as requested

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation for edge cases
    if (!email.trim() || !password.trim()) {
      setNotification({ message: "All fields are required.", type: "error" });
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setNotification({
        message: "Please enter a valid email address.",
        type: "error",
      });
      return;
    }

    try {
      const result = await onLogin(email, role, password);
      if (!result.success) {
        setNotification({
          message:
            result.message || "Login failed. Please check your credentials.",
          type: "error",
        });
      }
    } catch (error) {
      setNotification({
        message: "An unexpected error occurred. Please try again.",
        type: "error",
      });
      console.error("Login failed:", error);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !/^\S+@\S+\.\S+$/.test(forgotEmail)) {
      setForgotStatus("error");
      setForgotMessage("Please enter a valid email address.");
      return;
    }
    setForgotStatus("loading");
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    if (error) {
      setForgotStatus("error");
      setForgotMessage(error.message || "Failed to send reset email. Please try again.");
    } else {
      setForgotStatus("sent");
      setForgotMessage(`Reset link sent to ${forgotEmail}. Check your inbox.`);
    }
  };

  return (
    <>
      {notification && (
        <div
          className="fixed top-5 right-5 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center z-50"
          role="alert"
        >
          <strong className="font-bold mr-2">Error!</strong>
          <span className="block sm:inline">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
          >
            <svg
              className="fill-current h-6 w-6 text-red-500"
              role="button"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
            >
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
            </svg>
          </button>
        </div>
      )}
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

              <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setForgotStatus("idle"); setForgotMessage(""); setForgotEmail(""); }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                >
                  Forgot password?
                </button>
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
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8 relative">
            <button
              onClick={() => setShowForgot(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label="Close"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
              </svg>
            </button>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Reset password</h3>
            <p className="text-slate-500 text-sm mb-6">
              Enter your email and we'll send you a link to reset your password.
            </p>
            {forgotStatus === "sent" ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-green-700 text-sm font-medium text-center">
                {forgotMessage}
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                {forgotStatus === "error" && (
                  <p className="text-red-600 text-sm font-medium text-center bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    {forgotMessage}
                  </p>
                )}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-300" />
                  </div>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="glass-input block w-full pl-11 pr-4 py-4 rounded-2xl text-sm font-bold text-slate-900"
                    placeholder="name@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotStatus === "loading"}
                  className="w-full py-4 rounded-full text-base font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {forgotStatus === "loading" ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
