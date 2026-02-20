import React, { useState, useEffect } from "react";
import type { User, Provider } from "../types";
import { Navbar } from "./components/NavBar";
import { Home } from "./pages/Home";

const App = () => {
  // Simplified state for a landing-page experience
  const [user] = useState<User | Provider | null>(null);
  const [currentPath, setCurrentPath] = useState("/");

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

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar
        user={user}
        onLogout={() => {}}
        onNavigate={navigate}
        currentPath={currentPath}
        onOpenSupport={() => {}}
      />
      <main>
        {currentPath === "/" ? (
          <Home onNavigate={navigate} user={user} />
        ) : (
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
        )}
      </main>
    </div>
  );
};

export default App;
