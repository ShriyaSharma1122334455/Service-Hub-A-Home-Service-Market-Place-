import React, { useState, useEffect } from "react";
import { profileService } from "../services/profile";
import type { BackendUser } from "../services/profile";
import { ArrowLeft, User as UserIcon, Loader2 } from "lucide-react";

interface UsersListProps {
  onNavigate: (path: string) => void;
}

const getRoleLabel = (role: string) => {
  switch (role?.toLowerCase()) {
    case "customer":
      return "Customer";
    case "provider":
      return "Provider";
    case "admin":
      return "Admin";
    default:
      return role || "User";
  }
};

export const UsersList: React.FC<UsersListProps> = ({ onNavigate }) => {
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      const response = await profileService.listUsers();
      if (cancelled) return;
      if (response.success && response.data) {
        setUsers(response.data);
      } else {
        setError(response.error || "Failed to load users");
      }
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
        <p className="mt-4 text-slate-500 font-medium">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4">
        <div className="glass-panel p-8 rounded-[3rem] text-center max-w-md">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => onNavigate("/")}
            className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-140px)] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => onNavigate("/")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium mb-8 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-8">Users</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map((u) => (
            <button
              key={u._id}
              onClick={() => onNavigate(`/profile/${u._id}?type=user`)}
              className="glass-panel rounded-[2rem] p-6 text-left hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="flex items-center gap-4 mb-4">
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt={u.fullName}
                    className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center">
                    <UserIcon className="h-7 w-7 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 truncate">{u.fullName || "Unknown"}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    {getRoleLabel(u.role)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {users.length === 0 && (
          <p className="text-center text-slate-500 font-medium py-12">No users found.</p>
        )}
      </div>
    </div>
  );
};
