import { useState, useEffect } from "react";
import type { User, Provider } from "../types";
import { UserRole } from "../types";
import { signIn, signUpWithRole } from "./lib/auth";
import { Navbar } from "./components/NavBar";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Profile } from "./pages/Profile";
import { ProviderDashboard } from "./pages/ProviderDashboard";
import { FAQ } from "./pages/FAQ";
import { ServiceProviders } from "./pages/ServiceProviders";
import { SupportModal } from "./components/SupportModal";
import { Chatbot } from "./components/Chatbot";

const AUTH_STORAGE_KEY = "servicehub-auth";

type StoredAuth = {
  email: string;
  role: UserRole;
  name: string;
  avatar?: string;
  accessToken?: string;
};

const loadStoredAuth = (): StoredAuth | null => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (parsed?.email && parsed?.role) return parsed;
  } catch {
    /* ignore */
  }
  return null;
};

const saveAuth = (auth: StoredAuth) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
};

const clearAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

const App = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
  const [user, setUser] = useState<User | Provider | null>(() => {
    const stored = loadStoredAuth();
    if (stored) {
      return {
        id: "1",
        name: stored.name,
        email: stored.email,
        role: stored.role,
        avatar: stored.avatar,
      } as User;
    }
    return null;
  });
  const [currentPath, setCurrentPath] = useState("/");
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!loadStoredAuth(),
  );
  const authRestored = true;
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const [basePath, search] = currentPath.split("?");
  const searchParams = new URLSearchParams(search || "");
  const profileTypeParam = searchParams.get("type");
  const initialProfileType =
    profileTypeParam === "user" || profileTypeParam === "provider"
      ? profileTypeParam
      : null;

  useEffect(() => {
    const handleHashChange = () => {
      const path = window.location.hash.replace("#", "") || "/";
      setCurrentPath(path);
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Protected paths require a logged-in session
  const isProtectedPath =
    basePath === "/dashboard" || basePath.startsWith("/profile");

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (!authRestored) return;
    if (isProtectedPath && !isAuthenticated) {
      window.location.hash = "/login";
    }
  }, [isProtectedPath, isAuthenticated, authRestored]);

  // Redirect providers away from /dashboard if not authenticated
  // (handled by isProtectedPath guard above)

  const profileIdMatch = basePath.match(/^\/profile\/(.+)$/);
  const profileId = profileIdMatch ? profileIdMatch[1] : null;

  const bookServiceMatch = basePath.match(/^\/book\/(.+)$/);
  const bookServiceId = bookServiceMatch ? bookServiceMatch[1] : null;

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  const handleLogin = async (
    email: string,
    role: UserRole,
    password?: string,
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!password) {
        return { success: false, message: "Password required" };
      }
      const { data, error } = await signIn(email, password);
      if (error) {
        return {
          success: false,
          message: error.message || "Invalid credentials",
        };
      }
      const accessToken = data?.session?.access_token;
      const supabaseUser = data?.user;
      const name = supabaseUser?.email?.split("@")[0] || email.split("@")[0];
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=fff`;

      // Sync Supabase user → MongoDB on every login (idempotent upsert).
      // This covers: first-time login, email-confirmation-delayed signups, and role updates.

      // fetch full profile from backend
      let profile = null;
      if (accessToken) {
        try {
          const resp = await fetch(`${API_BASE}/api/users/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!resp.ok) {
            const text = await resp.text();
            console.error("Profile fetch failed", resp.status, text);
          } else {
            const json = await resp.json();
            if (json?.success) profile = json.data;
          }
        } catch (fetchErr) {
          console.error("Profile fetch error:", fetchErr);
        }
      }

      const normalizeRole = (r?: string, fallback?: UserRole) => {
        if (!r) return fallback || UserRole.CUSTOMER;
        return (
          (String(r).toUpperCase() as UserRole) || fallback || UserRole.CUSTOMER
        );
      };

      const userData = {
        id: profile?.id || "1",
        name: profile?.full_name || name,
        email,
        role: normalizeRole(profile?.role, role),
        avatar: profile?.avatar_url || avatar,
      } as User;

      setUser(userData);
      setIsAuthenticated(true);
      saveAuth({
        email,
        role: userData.role,
        name: userData.name,
        avatar: userData.avatar,
        accessToken,
      });
      if (userData.role === UserRole.PROVIDER) {
        navigate("/dashboard");
      } else {
        navigate("/");
      }

      return { success: true };
    } catch (err) {
      console.error("Login failed", err);
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      return { success: false, message };
      }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    clearAuth();
    navigate("/");
  };

  // const handleRegister = async (
  //   email: string,
  //   role: UserRole,
  //   password?: string,
  //   name?: string,
  //   phone?: string,
  // ) => {
  //   try {
  //     if (!password) throw new Error("Password required");
  //     // ensure role stored in Supabase as lowercase (backend expects lowercase)
  //     const roleLower = String(role).toLowerCase();
  //     const { error: signupError } = await signUpWithRole(
  //       email,
  //       password,
  //       roleLower,
  //       name,
  //       phone,
  //     );
  //     if (signupError) throw signupError;

  //     // complete login flow
  //     await handleLogin(email, role, password);
  //   } catch (err) {
  //     console.error("Register failed", err);
  //     // TODO: show UI error
  //   }
  // };

  const handleRegister = async (
    email: string,
    role: UserRole,
    password?: string,
    name?: string,
    phone?: string,
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!password) return { success: false, message: "Password required" };

      const roleLower = String(role).toLowerCase();

      const { error: signupError } = await signUpWithRole(
        email,
        password,
        roleLower,
        name,
        phone,
      );

      if (signupError) {
        if (signupError.message?.includes("already registered")) {
          return {
            success: false,
            message:
              "This email is already registered. Please sign in instead.",
          };
        }
        return { success: false, message: signupError.message };
      }

      await handleLogin(email, role, password);
      return { success: true };
    } catch (err) {
      console.error("Register failed", err);
      return {
        success: false,
        message: "An unexpected error occurred. Please try again.",
      };
    }
  };

  const renderContent = () => {
    if (isProtectedPath && !isAuthenticated) {
      return null;
    }

    if (profileId) {
      return (
        <Profile
          profileId={profileId}
          onNavigate={navigate}
          initialType={initialProfileType || undefined}
          currentUser={user}
        />
      );
    }

    if (bookServiceId) {
      return (
        <ServiceProviders serviceId={bookServiceId} onNavigate={navigate} />
      );
    }

    switch (basePath) {
      case "/":
        return <Home onNavigate={navigate} user={user} />;
      case "/login":
        return (
          <Login
            onLogin={handleLogin}
            onRegisterClick={() => navigate("/register")}
          />
        );
      case "/register":
        return (
          <Register
            onRegister={handleRegister}
            onLoginClick={() => navigate("/login")}
          />
        );
      case "/dashboard":
        return <ProviderDashboard user={user} onNavigate={navigate} />;
      case "/faq":
        return <FAQ />;
      default:
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <h2 className="text-2xl font-bold text-slate-800">
              Page Coming Soon
            </h2>
            <button
              onClick={() => navigate("/")}
              className="mt-4 text-teal-600 font-bold hover:underline"
            >
              Back to Home
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onNavigate={navigate}
        currentPath={currentPath}
        onOpenSupport={() => setIsSupportOpen(true)}
      />
      <main>{renderContent()}</main>
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        userId={user?.id || "guest"}
        userRole={
          (user?.role?.toLowerCase() as "customer" | "provider") || "customer"
        }
      />

      <Chatbot user={user} />
    </div>
  );
};

export default App;
