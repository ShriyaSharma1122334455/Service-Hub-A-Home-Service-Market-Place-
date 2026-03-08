import { useState, useEffect } from "react";
import type { User, Provider } from "../types";
import { UserRole } from "../types";
import { signIn, signUp } from "./lib/auth";
import { Navbar } from "./components/NavBar";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { FAQ } from "./pages/FAQ";
import { Profile } from "./pages/Profile";
import { UsersList } from "./pages/UsersList";
import { ProvidersList } from "./pages/ProvidersList";
import { SupportModal } from "./components/SupportModal";

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // auth is restored from localStorage in the user lazy initializer
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

  const isProtectedPath =
    basePath === "/users" ||
    basePath === "/providers" ||
    basePath.startsWith("/profile");
  useEffect(() => {
    if (!authRestored) return;
    if (isProtectedPath && !isAuthenticated) {
      window.location.hash = "/login";
    }
  }, [isProtectedPath, isAuthenticated, authRestored]);

  useEffect(() => {
    if (basePath === "/profile" && isAuthenticated && user) {
      window.location.hash =
        user.role === UserRole.PROVIDER ? "/users" : "/providers";
    }
  }, [basePath, isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (basePath === "/providers" && user.role === UserRole.PROVIDER) {
      window.location.hash = "/users";
    } else if (basePath === "/users" && user.role === UserRole.CUSTOMER) {
      window.location.hash = "/providers";
    }
  }, [basePath, isAuthenticated, user]);

  const profileIdMatch = basePath.match(/^\/profile\/(.+)$/);
  const profileId = profileIdMatch ? profileIdMatch[1] : null;

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  const handleLogin = async (
    email: string,
    role: UserRole,
    password?: string,
  ) => {
    try {
      if (!password) throw new Error("Password required");
      const { data, error } = await signIn(email, password);
      if (error) throw error;
      const accessToken = data?.session?.access_token;
      const supabaseUser = data?.user;
      const name = supabaseUser?.email?.split("@")[0] || email.split("@")[0];
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=fff`;

      // fetch full profile from backend
      let profile = null;
      if (accessToken) {
        const resp = await fetch("/api/profile/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await resp.json();
        if (json?.success) profile = json.data;
      }

      const userData = {
        id: profile?._id || "1",
        name: profile?.fullName || name,
        email,
        role: profile?.role || role,
        avatar: profile?.avatarUrl || avatar,
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
        navigate("/users");
      } else {
        navigate("/providers");
      }
    } catch (err) {
      console.error("Login failed", err);
      // TODO: show UI error
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    clearAuth();
    navigate("/");
  };

  const handleRegister = async (
    email: string,
    role: UserRole,
    password?: string,
  ) => {
    try {
      if (!password) throw new Error("Password required");
      const { data: signupData, error: signupError } = await signUp(
        email,
        password,
      );
      if (signupError) throw signupError;

      // Sign in to obtain token and sync with backend
      const { data: signinData, error: signinError } = await signIn(
        email,
        password,
      );
      if (signinError) throw signinError;
      const token = signinData?.session?.access_token;
      if (token) {
        await fetch("/api/profile/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fullName: email.split("@")[0], role }),
        });
      }

      // complete login flow
      await handleLogin(email, role, password);
    } catch (err) {
      console.error("Register failed", err);
      // TODO: show UI error
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
            onRegister={() => navigate("/login")}
            onLoginClick={() => navigate("/login")}
          />
        );
      case "/faq":
        return <FAQ />;
      case "/users":
        return <UsersList onNavigate={navigate} />;
      case "/providers":
        return <ProvidersList onNavigate={navigate} />;
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
    </div>
  );
};

export default App;
