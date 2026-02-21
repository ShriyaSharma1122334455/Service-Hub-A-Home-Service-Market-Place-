import React, { useState, useEffect } from "react";
import type { User, Provider, UserRole } from "../types";
import { Navbar } from "./components/NavBar";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";

const App = () => {
  const [user, setUser] = useState<User | Provider | null>(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const path = window.location.hash.replace("#", "") || "/";
      setCurrentPath(path);
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  const handleLogin = (email: string, role: UserRole) => {
    setIsAuthenticated(true);
    setUser({
      id: "1",
      name: email.split("@")[0],
      email: email,
      role: role,
      avatar: `https://ui-avatars.com/api/?name=${email}&background=0F172A&color=fff`,
    } as User);
    navigate("/dashboard");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    navigate("/");
  };

  const renderContent = () => {
    if (isAuthenticated && currentPath === "/dashboard") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh]">
          <div className="glass-panel p-12 rounded-[3rem] text-center max-w-md animate-float">
            <h2 className="text-4xl font-bold text-slate-900 mb-4 tracking-tighter">
              Welcome back!
            </h2>
            <p className="text-xl text-slate-500 font-medium">
              You have logged in.
            </p>
            <button
              onClick={handleLogout}
              className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all"
            >
              Log Out
            </button>
          </div>
        </div>
      );
    }

    switch (currentPath) {
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
        onOpenSupport={() => {}}
      />
      <main>{renderContent()}</main>
    </div>
  );
};

export default App;
