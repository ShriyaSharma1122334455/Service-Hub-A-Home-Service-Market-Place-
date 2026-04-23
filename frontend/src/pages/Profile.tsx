import React, { useState, useEffect } from "react";
import { profileService } from "../services/profile";
import type { BackendUser, BackendProvider } from "../services/profile";
import fetchApi from "../lib/api";
import {
  User as UserIcon,
  Mail,
  Shield,
  ArrowLeft,
  Loader2,
  Star,
  Briefcase,
  MessageSquare,
  Send,
  CheckCircle,
} from "lucide-react";
import {
  VerificationBadge,
  type VerificationStatusType,
} from "../components/VerificationBadge";
import { VerificationDetailsModal } from "../components/VerificationDetailsModal";

interface Review {
  id: string;
  booking_id?: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { full_name: string; avatar_url: string | null } | null;
}

interface ProviderService {
  id: string;
  name: string;
  description: string;
  base_price: number;
  duration_minutes: number;
  sub_category?: string;
}

interface AvailabilitySlot {
  id: string;
  date: string;       // "2026-04-25"
  start_time: string; // "09:00"
  end_time: string;   // "10:00"
  is_booked: boolean;
}

interface CompletedBooking {
  id: string;
  created_at: string;
  service?: { name: string } | null;
}

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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Review form state (only for customers viewing a provider profile)
  const [reviewableBookings, setReviewableBookings] = useState<
    CompletedBooking[]
  >([]);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [providerServices, setProviderServices] = useState<ProviderService[]>([]);
  const [providerServicesLoading, setProviderServicesLoading] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

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
        const meResponse = await profileService.getMe();
        if (cancelled) return;
        if (meResponse.success && meResponse.data) {
          const d = meResponse.data;
          if (d.type === "provider") {
            setProfile({ type: "provider", data: d as BackendProvider });
          } else {
            setProfile({ type: "user", data: d as BackendUser });
          }
        } else if (currentUser && "name" in currentUser) {
          const role = (currentUser as { role?: string }).role || "customer";
          const type = role === "provider" ? "provider" : "user";
          setProfile({
            type,
            data: {
              id: "me",
              supabase_id: "",
              full_name:
                (currentUser as { name?: string }).name || email.split("@")[0],
              email,
              avatar_url: (currentUser as { avatar?: string }).avatar,
              role,
              verificationStatus: "unverified",
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
  }, [profileId, initialType, currentUser, currentUser?.email]);

  // Fetch reviews when a provider profile loads
  useEffect(() => {
    if (!profile || profile.type !== "provider") return;
    const providerId = profile.data.id;
    if (!providerId) return;

    let cancelled = false;
    const loadReviews = async () => {
      setReviewsLoading(true);
      try {
        // fetchApi already unwraps `.data` from the response body, so
        // res.data IS the reviews array directly (not { count, data: [...] }).
        const res = await fetchApi<Review[]>(`/reviews/${providerId}`);
        if (!cancelled && res.success) {
          setReviews(Array.isArray(res.data) ? res.data : []);
        }
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    };
    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  // Fetch the customer's completed bookings for this provider so we can show the review form
  useEffect(() => {
    if (!profile || profile.type !== "provider") return;
    if (currentUser?.role?.toLowerCase() !== "customer") return;
    if (profileId === "me") return;

    const providerId = String(profile.data.id);
    let cancelled = false;

    const loadBookings = async () => {
      // fetchApi already unwraps `.data` from the response body, so
      // res.data IS the bookings array directly.
      const res = await fetchApi<CompletedBooking[]>("/bookings");
      if (cancelled || !res.success) return;
      const all = Array.isArray(res.data) ? res.data : [];
      // Keep only completed bookings for this specific provider
      const eligible = all.filter(
        (b: CompletedBooking & { provider_id?: string; status?: string }) =>
          b.status === "completed" &&
          String(b.provider_id ?? "") === providerId,
      );
      if (!cancelled) setReviewableBookings(eligible);
    };
    loadBookings();
    return () => {
      cancelled = true;
    };
  }, [profile, currentUser, profileId]);

  // Fetch provider's services and upcoming availability for public profile pages
  useEffect(() => {
    if (!profile || profile.type !== "provider" || profileId === "me") return;

    const providerId = profile.data.id;
    if (!providerId) return;

    const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
    let cancelled = false;

    const loadServices = async () => {
      setProviderServicesLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/providers/${providerId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.data) {
          const raw: unknown[] = Array.isArray(data.data.services) ? data.data.services : [];
          setProviderServices(
            raw.map((s) => {
              const svc = s as Record<string, unknown>;
              return {
                id: String(svc.id ?? svc._id ?? ""),
                name: String(svc.name ?? ""),
                description: String(svc.description ?? ""),
                base_price: Number(svc.base_price ?? 0),
                duration_minutes: Number(svc.duration_minutes ?? 0),
                sub_category: svc.sub_category ? String(svc.sub_category) : undefined,
              };
            }),
          );
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setProviderServicesLoading(false);
      }
    };

    const loadAvailability = async () => {
      setAvailabilityLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/availability/${providerId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success && Array.isArray(data.data)) {
          const today = new Date().toISOString().split("T")[0];
          setAvailabilitySlots(
            (data.data as AvailabilitySlot[]).filter(
              (slot) => !slot.is_booked && slot.date >= today,
            ),
          );
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    };

    loadServices();
    loadAvailability();
    return () => { cancelled = true; };
  }, [profile, profileId]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewRating === 0) {
      setReviewError("Please select a star rating.");
      return;
    }
    if (reviewableBookings.length === 0) return;

    setReviewSubmitting(true);
    setReviewError(null);

    // Use the most recent completed booking (index 0, ordered desc)
    const bookingId = reviewableBookings[0].id;
    const res = await fetchApi<Review>("/reviews", {
      method: "POST",
      body: JSON.stringify({
        booking_id: bookingId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      }),
    });

    setReviewSubmitting(false);

    if (res.success && res.data) {
      setReviewSuccess(true);
      setReviewRating(0);
      setReviewComment("");
      // Prepend new review optimistically so user sees it immediately
      const newReview = res.data as unknown as Review;
      setReviews((prev) => [
        {
          ...newReview,
          reviewer: { full_name: "You", avatar_url: null },
        },
        ...prev,
      ]);
    } else {
      const msg =
        (res as { error?: string }).error ?? "Failed to submit review.";
      if (msg.includes("already reviewed")) {
        setReviewSuccess(true); // treat as success — just hide the form
      } else {
        setReviewError(msg);
      }
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role?.toLowerCase()) {
      case "customer":
        return "User (Customer)";
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
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Error Loading Profile
          </h2>
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
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Profile Not Found
          </h2>
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
  const fullName =
    (data as BackendProvider).business_name || data.full_name || "Unknown";
  const avatarUrl = data.avatarUrl;
  const role = data.role || (isProvider ? "provider" : "customer");
  const email = data.email;
  const bio =
    data.bio ||
    (isProvider ? (data as BackendProvider).description : undefined);
  const rating = isProvider
    ? ((data as BackendProvider).rating_avg ?? (data as BackendProvider).rating)
    : (data as BackendUser).provider?.rating;
  const serviceCategory = (data as BackendProvider).serviceCategory;

  return (
    <div className="min-h-[calc(100vh-140px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() =>
            onNavigate(
              profileId === "me"
                ? isProvider
                  ? "/users"
                  : "/providers"
                : isProvider
                  ? "/providers"
                  : "/users",
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

            <div className="mb-6">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                {fullName}
              </h1>
              <div className="flex items-center flex-wrap gap-2">
                <span
                  className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold ${getRoleBadgeColor(role)}`}
                >
                  {isProvider ? (
                    <Briefcase className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Shield className="h-4 w-4 mr-1.5" />
                  )}
                  {getRoleLabel(role)}
                </span>
                <VerificationBadge
                  status={
                    ((data as BackendProvider).verificationStatus ||
                      (data as BackendUser).verificationStatus ||
                      "unverified") as VerificationStatusType
                  }
                  onClick={() => setShowVerificationModal(true)}
                />
              </div>
            </div>

            <div className="space-y-4">
              {email && profileId === "me" && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <Mail className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Email
                    </p>
                    <p className="text-slate-900 font-medium">{email}</p>
                  </div>
                </div>
              )}

              {serviceCategory && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <Briefcase className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Service Category
                    </p>
                    <p className="text-slate-900 font-medium">
                      {serviceCategory}
                    </p>
                  </div>
                </div>
              )}

              {bio && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Bio
                  </p>
                  <p className="text-slate-700">{bio}</p>
                </div>
              )}

              {rating !== undefined && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Rating
                  </p>
                  <div className="flex items-center gap-2">
                    <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
                    <span className="text-2xl font-bold text-slate-900">
                      {rating.toFixed(1)}
                    </span>
                    <span className="text-slate-400">/ 5.0</span>
                  </div>
                </div>
              )}

              {/* Role Switching Section - Only for customers viewing their own profile */}
              {profileId === "me" && role === "customer" && (
                <div className="p-6 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-2xl border border-teal-100">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="h-6 w-6 text-teal-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900 mb-2">
                        Become a Service Provider
                      </h3>
                      <p className="text-slate-600 mb-4 leading-relaxed">
                        Join our community of service providers and start
                        offering your services to customers. You'll get access
                        to the provider dashboard, booking management, and more.
                      </p>
                      <button
                        onClick={async () => {
                          if (
                            !confirm(
                              "Are you sure you want to become a service provider? This action cannot be undone.",
                            )
                          ) {
                            return;
                          }

                          try {
                            const res = await fetchApi("/users/me/role", {
                              method: "PUT",
                              body: JSON.stringify({ role: "provider" }),
                            });

                            if (res.success) {
                              alert(
                                "Welcome to ServiceHub as a provider! Your profile has been updated.",
                              );
                              window.location.reload(); // Reload to refresh all state
                            } else {
                              alert(
                                `Failed to update role: ${res.error || "Unknown error"}`,
                              );
                            }
                          } catch (error) {
                            alert(
                              "An error occurred while updating your role. Please try again.",
                            );
                            console.error(error);
                          }
                        }}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-bold rounded-full hover:bg-teal-700 transition-all shadow-lg hover:shadow-xl"
                      >
                        <Briefcase className="h-5 w-5" />
                        Become Provider
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {profileId === "me" && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    ID
                  </p>
                  <p className="text-slate-500 text-sm font-mono">{data.id}</p>
                </div>
              )}

              {/* Reviews section — provider profiles only */}
              {isProvider && (
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="h-5 w-5 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Reviews
                      {reviews.length > 0 && (
                        <span className="ml-2 normal-case font-semibold text-slate-500">
                          ({reviews.length})
                        </span>
                      )}
                    </h2>
                  </div>

                  {reviewsLoading && (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-6 w-6 text-teal-500 animate-spin" />
                    </div>
                  )}

                  {!reviewsLoading && reviews.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50 rounded-2xl">
                      <Star className="h-8 w-8 text-slate-200 mb-2" />
                      <p className="text-slate-500 font-medium text-sm">
                        No reviews yet
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        Reviews appear here after completed bookings.
                      </p>
                    </div>
                  )}

                  {!reviewsLoading && reviews.length > 0 && (
                    <div className="space-y-3">
                      {reviews.map((review) => (
                        <div
                          key={review.id}
                          className="p-4 bg-slate-50 rounded-2xl space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {review.reviewer?.avatar_url ? (
                                <img
                                  src={review.reviewer.avatar_url}
                                  alt={review.reviewer.full_name}
                                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                  <UserIcon className="h-4 w-4 text-slate-400" />
                                </div>
                              )}
                              <span className="text-sm font-semibold text-slate-700">
                                {review.reviewer?.full_name ?? "Anonymous"}
                              </span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  size={13}
                                  className={
                                    i < review.rating
                                      ? "fill-amber-400 text-amber-400"
                                      : "text-slate-200 fill-slate-200"
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          {review.comment && (
                            <p className="text-sm text-slate-600 leading-relaxed">
                              {review.comment}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">
                            {new Date(review.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Leave a Review form ── */}
                  {/* Only shown to logged-in customers who have a completed booking with this provider */}
                  {currentUser?.role?.toLowerCase() === "customer" &&
                    profileId !== "me" &&
                    reviewableBookings.length > 0 && (
                      <div className="mt-6 pt-5 border-t border-slate-100">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Star className="h-4 w-4 text-amber-400" />
                          Leave a Review
                        </h3>

                        {reviewSuccess ? (
                          <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl">
                            <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                            <p className="text-sm font-semibold text-emerald-700">
                              Thanks! Your review has been submitted.
                            </p>
                          </div>
                        ) : (
                          <form
                            onSubmit={handleReviewSubmit}
                            className="space-y-4"
                          >
                            {/* Star picker */}
                            <div>
                              <p className="text-xs text-slate-500 mb-2 font-medium">
                                Your rating
                              </p>
                              <div className="flex items-center gap-1">
                                {Array.from({ length: 5 }).map((_, i) => {
                                  const val = i + 1;
                                  return (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setReviewRating(val)}
                                      onMouseEnter={() => setReviewHover(val)}
                                      onMouseLeave={() => setReviewHover(0)}
                                      className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
                                      aria-label={`${val} star${val > 1 ? "s" : ""}`}
                                    >
                                      <Star
                                        size={28}
                                        className={
                                          val <= (reviewHover || reviewRating)
                                            ? "fill-amber-400 text-amber-400"
                                            : "text-slate-200 fill-slate-200"
                                        }
                                      />
                                    </button>
                                  );
                                })}
                                {reviewRating > 0 && (
                                  <span className="ml-2 text-sm font-semibold text-slate-500">
                                    {
                                      [
                                        "",
                                        "Poor",
                                        "Fair",
                                        "Good",
                                        "Very Good",
                                        "Excellent",
                                      ][reviewRating]
                                    }
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Comment */}
                            <div>
                              <label className="text-xs text-slate-500 font-medium block mb-1.5">
                                Comment{" "}
                                <span className="text-slate-300">
                                  (optional)
                                </span>
                              </label>
                              <textarea
                                value={reviewComment}
                                onChange={(e) =>
                                  setReviewComment(e.target.value)
                                }
                                rows={3}
                                maxLength={500}
                                placeholder="Share your experience with this provider…"
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none transition"
                              />
                              <p className="text-right text-xs text-slate-300 mt-1">
                                {reviewComment.length}/500
                              </p>
                            </div>

                            {/* Error */}
                            {reviewError && (
                              <p className="text-xs text-red-500 font-medium">
                                {reviewError}
                              </p>
                            )}

                            {/* Submit */}
                            <button
                              type="submit"
                              disabled={reviewSubmitting || reviewRating === 0}
                              className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-full hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                              {reviewSubmitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              {reviewSubmitting
                                ? "Submitting…"
                                : "Submit Review"}
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                </div>
              )}

              {/* Services Offered — public provider profiles only */}
              {isProvider && profileId !== "me" && (
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">🛠️</span>
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Services Offered
                    </h2>
                  </div>

                  {providerServicesLoading && (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-6 w-6 text-teal-500 animate-spin" />
                    </div>
                  )}

                  {!providerServicesLoading && providerServices.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 text-center bg-slate-50 rounded-2xl">
                      <p className="text-slate-500 font-medium text-sm">No services listed yet</p>
                    </div>
                  )}

                  {!providerServicesLoading && providerServices.length > 0 && (
                    <div className="space-y-3">
                      {providerServices.map((svc) => (
                        <div key={svc.id} className="flex items-start justify-between gap-4 p-4 bg-slate-50 rounded-2xl">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm">{svc.name}</p>
                            {svc.sub_category && (
                              <p className="text-xs text-teal-600 font-medium mt-0.5">{svc.sub_category}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{svc.description}</p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-sm font-bold text-slate-900">From ${svc.base_price}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {Math.floor(svc.duration_minutes / 60) > 0 ? `${Math.floor(svc.duration_minutes / 60)}h ` : ""}
                              {svc.duration_minutes % 60 > 0 ? `${svc.duration_minutes % 60}m` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Availability — public provider profiles only */}
              {isProvider && profileId !== "me" && (
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">📅</span>
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Availability
                    </h2>
                  </div>

                  {availabilityLoading && (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-6 w-6 text-teal-500 animate-spin" />
                    </div>
                  )}

                  {!availabilityLoading && availabilitySlots.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 text-center bg-slate-50 rounded-2xl">
                      <p className="text-slate-500 font-medium text-sm">No upcoming availability</p>
                      <p className="text-slate-400 text-xs mt-1">This provider hasn't set future slots yet.</p>
                    </div>
                  )}

                  {!availabilityLoading && availabilitySlots.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {availabilitySlots.slice(0, 12).map((slot) => (
                        <div key={slot.id} className="flex flex-col items-center px-3 py-2 bg-teal-50 border border-teal-100 rounded-xl text-center">
                          <span className="text-xs font-bold text-teal-800">
                            {new Date(slot.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span className="text-xs text-teal-600 font-medium">
                            {slot.start_time} – {slot.end_time}
                          </span>
                        </div>
                      ))}
                      {availabilitySlots.length > 12 && (
                        <div className="flex items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl">
                          <span className="text-xs text-slate-500 font-medium">+{availabilitySlots.length - 12} more</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {profileId === "me" &&
                ["unverified", "pending"].includes(
                  ((data as BackendProvider).verificationStatus ||
                    (data as BackendUser).verificationStatus ||
                    "unverified") as string
                ) && (
                  <button
                    onClick={() => onNavigate("/verify")}
                    className="w-full py-3 bg-teal-600 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    {((data as BackendProvider).verificationStatus ||
                      (data as BackendUser).verificationStatus) === "pending"
                      ? "Complete Verification"
                      : "Verify Your Identity"}
                  </button>
                )}
            </div>
          </div>
        </div>

        <VerificationDetailsModal
          userId={data.id || profileId}
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
        />
      </div>
    </div>
  );
};
