import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import type { User, Provider } from "../types";
import { UserRole } from "../types";
import { signIn } from "./lib/auth";
import { Navbar } from "./components/NavBar";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Profile } from "./pages/Profile";
import { ProviderDashboard } from "./pages/ProviderDashboard";
import { CustomerDashboard } from "./pages/CustomerDashboard";
import { FAQ } from "./pages/FAQ";
import { VisualDamageAssessment } from "./pages/VisualDamageAssessment";
import { ServiceProviders } from "./pages/ServiceProviders";
import { BookingConfirmation } from "./pages/BookingConfirmation";
import { ProviderBookings } from "./pages/ProviderBookings";
import { SupportModal } from "./components/SupportModal";
import { Chatbot } from "./components/Chatbot";
import { VerifyPage } from "./pages/verify";
import { EditProfile } from "./pages/EditProfile";
import { supabase } from "./lib/supabase";
import { toUserRole } from "./lib/roleUtils";

const App = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
  const [user, setUser] = useState<User | Provider | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [currentPath, setCurrentPath] = useState("/");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authRestored, setAuthRestored] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const [basePath, search] = currentPath.split("?");
  const searchParams = new URLSearchParams(search || "");
  const profileTypeParam = searchParams.get("type");
  const initialProfileType =
    profileTypeParam === "user" || profileTypeParam === "provider"
      ? profileTypeParam
      : null;

  // Supabase session management handles auth state restoration
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async (session: Session | null) => {
      if (!session) {
        if (mounted) {
          setUser(null);
          setAccessToken("");
          setIsAuthenticated(false);
          setAuthRestored(true);
        }
        return;
      }

      const email = session.user.email || "";
      const name = session.user.user_metadata?.full_name || email.split("@")[0];
      const avatar = session.user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=fff`;

      let profile = null;
      try {
        const resp = await fetch(`${API_BASE}/api/users/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json?.success) profile = json.data;
        }
      } catch (err) {
        console.error("Profile fetch error:", err);
      }

      if (mounted) {
        setAccessToken(session.access_token);
        setUser({
          id: profile?.id || session.user.id || "",
          name: profile?.full_name || name,
          email,
          role: profile?.role ? toUserRole(profile.role) : toUserRole(session.user.user_metadata?.role || "customer"),
          avatar: profile?.avatar_url || avatar,
        } as User);
        setIsAuthenticated(true);
        setAuthRestored(true);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      initializeAuth(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      initializeAuth(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [API_BASE]);

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
    basePath === "/dashboard" ||
    basePath.startsWith("/profile") ||
    basePath === "/my-bookings" ||
    basePath.startsWith("/booking-confirmation");

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (!authRestored) return;
    if (isProtectedPath && !isAuthenticated) {
      window.location.hash = "/login";
    }
  }, [isProtectedPath, isAuthenticated, authRestored]);

  // Visual damage assessment: customers only (not guests or providers)
  useEffect(() => {
    if (!authRestored) return;
    if (basePath !== "/visual-damage") return;
    if (!isAuthenticated) {
      window.location.hash = "/login";
      return;
    }
    if (user && String(user.role).toLowerCase() === "provider") {
      window.location.hash = "/dashboard";
    }
  }, [authRestored, basePath, isAuthenticated, user]);

  const isEditProfile = basePath === "/profile/edit";

  const profileIdMatch = !isEditProfile
    ? basePath.match(/^\/profile\/(.+)$/)
    : null;
  const profileId = profileIdMatch ? profileIdMatch[1] : null;

  const bookServiceMatch = basePath.match(/^\/book\/(.+)$/);
  const bookServiceId = bookServiceMatch ? bookServiceMatch[1] : null;

  const bookingConfirmationMatch = basePath.match(
    /^\/booking-confirmation\/(.+)$/,
  );
  const bookingConfirmationId = bookingConfirmationMatch
    ? bookingConfirmationMatch[1]
    : null;

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  /** Get the current access token */
  const getToken = (): string => {
    return accessToken;
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

      if (!accessToken) {
        return {
          success: false,
          message: "Login failed — no session returned",
        };
      }

      const name = supabaseUser?.email?.split("@")[0] || email.split("@")[0];
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=fff`;

      let profile = null;
      if (accessToken) {
        try {
          const resp = await fetch(`${API_BASE}/api/users/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!resp.ok) {
            console.error("Profile fetch failed", resp.status);
          } else {
            const json = await resp.json();
            if (json?.success) profile = json.data;
          }
        } catch (fetchErr) {
          console.error("Profile fetch error:", fetchErr);
        }
      }

      const userData = {
        id: profile?.id || supabaseUser?.id || "",
        name: profile?.full_name || name,
        email,
        role: profile?.role ? toUserRole(profile.role) : role,
        avatar: profile?.avatar_url || avatar,
      } as User;

      // Validate that the selected role matches the actual role from database
      if (profile?.role) {
        const actualRole = toUserRole(profile.role);
        if (actualRole !== role) {
          return {
            success: false,
            message: `Invalid role selected. This account is registered as a ${actualRole.toLowerCase()}.`,
          };
        }
      } else {
        // If we can't fetch profile, assume the selected role is correct
        // This handles cases where profile creation is pending
        console.warn(
          "Could not fetch user profile, proceeding with selected role",
        );
      }

      setUser(userData);
      setAccessToken(accessToken);
      setIsAuthenticated(true);

      // All authenticated users land on /dashboard; the route renders the
      // role-appropriate view (CustomerDashboard or ProviderDashboard).
      navigate("/dashboard");

      return { success: true };
    } catch (err) {
      console.error("Login failed", err);
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      return { success: false, message };
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUser(null);
    setAccessToken("");
    navigate("/");
  };

  const handleRegister = async (
    email: string,
    role: UserRole,
    password?: string,
    name?: string,
    phone?: string,
    dob?: string,
    street?: string,
    city?: string,
    state?: string,
    zip?: string,
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!password) return { success: false, message: "Password required" };

      const roleLower = String(role).toLowerCase();

      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          role: roleLower,
          fullName: name,
          phone,
          dob,
          street,
          city,
          state,
          zip,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.error?.includes("already")) {
          return {
            success: false,
            message:
              "This email is already registered. Please sign in instead.",
          };
        }
        return {
          success: false,
          message: result.error || "Registration failed",
        };
      }

      // Login the user after successful signup
      const loginResult = await handleLogin(email, role, password);
      if (!loginResult.success) {
        return loginResult;
      }

      return { success: true };
    } catch (err) {
      console.error("Register failed", err);
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";
      return {
        success: false,
        message,
      };
    }
  };

  const renderContent = () => {
    if (isProtectedPath && !isAuthenticated) {
      return null;
    }

    if (isEditProfile) {
      return (
        <EditProfile
          onNavigate={navigate}
          currentUser={user}
          onProfileUpdate={(newName) => {
            setUser((prev) => (prev ? { ...prev, name: newName } : prev));
          }}
        />
      );
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
        <ServiceProviders
          serviceId={bookServiceId}
          onNavigate={navigate}
          user={user}
          token={getToken()}
        />
      );
    }

    if (bookingConfirmationId) {
      return (
        <BookingConfirmation
          bookingId={bookingConfirmationId}
          token={getToken()}
          onNavigate={navigate}
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
            onRegister={handleRegister}
            onLoginClick={() => navigate("/login")}
          />
        );
      case "/dashboard":
        // Route to the role-appropriate dashboard. ProviderDashboard also
        // performs its own role check internally as a safety net.
        if (user && String(user.role).toLowerCase() === "customer") {
          return (
            <CustomerDashboard
              user={user}
              token={getToken()}
              onNavigate={navigate}
            />
          );
        }
        return (
          <ProviderDashboard
            user={user}
            token={getToken()}
            onNavigate={navigate}
          />
        );
      case "/verify":
        return <VerifyPage userId={user?.id || ""} onNavigate={navigate} />;
      case "/faq":
        return (
          <FAQ
            userRole={user?.role?.toLowerCase() as "customer" | "provider"}
          />
        );
      case "/visual-damage": {
        const isCustomerUser =
          isAuthenticated &&
          user &&
          String(user.role).toLowerCase() === "customer";
        if (!isCustomerUser) {
          return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center text-slate-500 text-sm">
              Redirecting…
            </div>
          );
        }
        return <VisualDamageAssessment onNavigate={navigate} />;
      }
      case "/my-bookings":
        return <ProviderBookings token={getToken()} onNavigate={navigate} />;
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

      <Chatbot
        user={user}
        onOpenVisualDamage={() => navigate("/visual-damage")}
      />
    </div>
  );
};

export default App;
