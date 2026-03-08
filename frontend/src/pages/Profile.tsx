import React, { useState, useEffect } from "react";
import { profileService } from "../services/profile";
import type { BackendUser, BackendProvider } from "../services/profile";
import { User as UserIcon, Mail, Shield, ArrowLeft, Loader2, Star, Briefcase } from "lucide-react";

interface ProfileProps {
  profileId: string;
  onNavigate: (path: string) => void;
  initialType?: "user" | "provider";
  currentUser?: { email?: string; role?: string } | null;
}

type ProfileData =
  | { type: "user"; data: BackendUser }
  | { type: "provider"; data: BackendProvider };

export const Profile: React.FC<ProfileProps> = ({
  profileId,
  onNavigate,
  initialType,
  currentUser,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!profileId) {
        setError("No profile ID");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setProfile(null);

      if (profileId === "me") {
        const email = currentUser?.email;
        if (!email) {
          setError("You must be logged in to view your profile");
          setLoading(false);
          return;
        }
        const meResponse = await profileService.getMe(email);
        if (cancelled) return;
        if (meResponse.success && meResponse.data) {
          const d = meResponse.data;
          if (d.type === "provider") {
            setProfile({ type: "provider", data: d });
          } else {
            setProfile({ type: "user", data: d });
          }
        } else if (currentUser && "name" in currentUser) {
          const role = (currentUser as { role?: string }).role || "customer";
          const type = role === "provider" ? "provider" : "user";
          setProfile({
            type,
            data: {
              _id: "me",
              fullName: (currentUser as { name?: string }).name || email.split("@")[0],
              email,
              avatarUrl: (currentUser as { avatar?: string }).avatar,
              role,
            } as BackendUser & BackendProvider,
          });
        } else {
          setError(meResponse.error || "Failed to fetch your profile");
        }
        setLoading(false);
        return;
      }

      const tryUserFirst = initialType !== "provider";

      const fetchUserFirst = async () => {
        const userResponse = await profileService.getUser(profileId);
        if (cancelled) return true;
        if (userResponse.success && userResponse.data) {
          setProfile({ type: "user", data: userResponse.data });
          setLoading(false);
          return true;
        }
        return false;
      };

      const fetchProviderFirst = async () => {
        const providerResponse = await profileService.getProvider(profileId);
        if (cancelled) return true;
        if (providerResponse.success && providerResponse.data) {
          setProfile({ type: "provider", data: providerResponse.data });
          setLoading(false);
          return true;
        }
        return false;
      };

      let handled = false;

      if (tryUserFirst) {
        handled = await fetchUserFirst();
        if (!handled) {
          handled = await fetchProviderFirst();
        }
      } else {
        handled = await fetchProviderFirst();
        if (!handled) {
          handled = await fetchUserFirst();
        }
      }

      if (!handled && !cancelled) {
        setError("Failed to fetch profile");
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [profileId, initialType, currentUser?.email]);

  const getRoleLabel = (role: string) => {
    switch (role?.toLowerCase()) {
      case "customer":
        return "Customer";
      case "provider":
        return "Service Provider";
      case "admin":
        return "Administrator";
      default:
        return role || "User";
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role?.toLowerCase()) {
      case "customer":
        return "bg-blue-100 text-blue-700";
      case "provider":
        return "bg-green-100 text-green-700";
      case "admin":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
        <p className="mt-4 text-slate-500 font-medium">Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4">
        <div className="glass-panel p-8 rounded-[3rem] text-center max-w-md">
          <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserIcon className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error Loading Profile</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => onNavigate("/")}
            className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4">
        <div className="glass-panel p-8 rounded-[3rem] text-center max-w-md">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Profile Not Found</h2>
          <p className="text-slate-500 mb-6">Profile data not available.</p>
          <button
            onClick={() => onNavigate("/")}
            className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const isProvider = profile.type === "provider";
  const data = profile.data;
  const fullName = (data as BackendProvider).businessName || data.fullName || "Unknown";
  const avatarUrl = data.avatarUrl;
  const role = data.role || (isProvider ? "provider" : "customer");
  const email = data.email;
  const bio = data.bio || (isProvider ? (data as BackendProvider).description : undefined);
  const rating = isProvider
    ? ((data as BackendProvider).ratingAvg ?? (data as BackendProvider).rating)
    : (data as BackendUser).provider?.rating;
  const serviceCategory = (data as BackendProvider).serviceCategory;
  const isVerified = isProvider && !!(data as BackendProvider).verified;
  const availabilityStatus = isProvider
    ? (data as BackendProvider).availabilityStatus
    : undefined;
  return (
    <div className="min-h-[calc(100vh-140px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() =>
            onNavigate(
              profileId === "me"
                ? (isProvider ? "/users" : "/providers")
                : isProvider
                  ? "/providers"
                  : "/users"
            )
          }
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium mb-8 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>

        <div className="glass-panel rounded-[3rem] overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-700 h-32"></div>
          
          <div className="px-8 pb-8">
            <div className="relative -mt-16 mb-6">
              <div className="h-32 w-32 rounded-full bg-white p-1 shadow-xl">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full rounded-full bg-slate-100 flex items-center justify-center">
                    <UserIcon className="h-16 w-16 text-slate-400" />
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">{fullName}</h1>
                <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold ${getRoleBadgeColor(role)}`}>
                  {isProvider ? <Briefcase className="h-4 w-4 mr-1.5" /> : <Shield className="h-4 w-4 mr-1.5" />}
                  {getRoleLabel(role)}
                </span>
              </div>
              {profileId === "me" && (
                <button
                  aria-label="Edit profile"
                  className="mt-1 px-4 py-2 rounded-full text-sm font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-all"
                >
                  Edit Profile
                </button>
              )}
            </div>

            <div className="space-y-4">
              {email && profileId === "me" && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <Mail className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email</p>
                    <p className="text-slate-900 font-medium">{email}</p>
                  </div>
                </div>
              )}

              {serviceCategory && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <Briefcase className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Service Category</p>
                    <p className="text-slate-900 font-medium">{serviceCategory}</p>
                  </div>
                </div>
              )}

              {isProvider && (data as BackendProvider).hourlyRate !== undefined && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <Briefcase className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hourly Rate</p>
                    <p className="text-slate-900 font-medium">${(data as BackendProvider).hourlyRate}/hr</p>
                  </div>
                </div>
              )}

              {bio && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bio</p>
                  <p className="text-slate-700">{bio}</p>
                </div>
              )}

              {rating !== undefined && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Rating</p>
                  <div className="flex items-center gap-2">
                    <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
                    <span className="text-2xl font-bold text-slate-900">{rating.toFixed(1)}</span>
                    <span className="text-slate-400">/ 5.0</span>
                  </div>
                </div>
              )}

              {profileId === "me" && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">ID</p>
                  <p className="text-slate-500 text-sm font-mono">{data._id}</p>
                </div>
              )}

              {isVerified && (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl">
                  <Shield className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Verified Provider</p>
                    <p className="text-green-700 text-sm font-medium">Identity verified by ServiceHub</p>
                  </div>
                </div>
              )}

              {availabilityStatus && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      availabilityStatus === "AVAILABLE"
                        ? "bg-green-500"
                        : availabilityStatus === "BUSY"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                    }`}
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Availability</p>
                    <p className="text-slate-900 font-medium capitalize">{availabilityStatus.toLowerCase().replace("_", " ")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
