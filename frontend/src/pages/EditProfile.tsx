import React, { useState, useEffect } from "react";
import { profileService } from "../services/profile";
import {
  ArrowLeft,
  Loader2,
  Save,
  User as UserIcon,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import {
  validateFullName,
  validatePhoneNumber,
  validateBio,
  validateDob,
  validateEditProfileForm,
  type FormErrors,
} from "../lib/profileValidation";

interface EditProfileProps {
  onNavigate: (path: string) => void;
  currentUser?: { email?: string; role?: string } | null;
  onProfileUpdate?: (newName: string) => void;
}

type FormData = {
  full_name: string;
  email: string;
  phone: string;
  bio: string;
  dob: string;
};

type TouchedFields = Partial<Record<keyof FormData, boolean>>;

export const EditProfile: React.FC<EditProfileProps> = ({
  onNavigate,
  currentUser,
  onProfileUpdate,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    full_name: "",
    email: "",
    phone: "",
    bio: "",
    dob: "",
  });
  const [initialData, setInitialData] = useState<FormData | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.email) {
      onNavigate("/login");
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setLoadError(null);
      const res = await profileService.getMe();
      if (cancelled) return;
      setLoading(false);

      if (!res.success || !res.data) {
        setLoadError(res.error || "Failed to load profile");
        return;
      }

      // getMe returns either a user or provider shape — both include editable profile fields
      const d = res.data as {
        full_name?: string;
        email?: string;
        phone?: string;
        bio?: string;
        dob?: string;
      };
      const initial: FormData = {
        full_name: d.full_name ?? "",
        email: d.email ?? currentUser.email ?? "",
        phone: d.phone ?? "",
        bio: d.bio ?? "",
        dob: d.dob ?? "",
      };
      setFormData(initial);
      setInitialData(initial);
    };

    loadProfile();
    return () => { cancelled = true; };
  // onNavigate is a stable navigation helper — not a data dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.email]);

  const hasChanges =
    initialData !== null &&
    (formData.full_name !== initialData.full_name ||
      formData.phone !== initialData.phone ||
      formData.bio !== initialData.bio ||
      formData.dob !== initialData.dob);

  const validateField = (name: keyof FormData, value: string): string | undefined => {
    if (name === "full_name") return validateFullName(value).error;
    if (name === "phone") return validatePhoneNumber(value).error;
    if (name === "bio") return validateBio(value).error;
    if (name === "dob") return validateDob(value).error;
    return undefined;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSuccessMessage(null);
    setSubmitError(null);

    if (touched[name as keyof FormData]) {
      const fieldError = validateField(name as keyof FormData, value);
      setErrors((prev) => ({ ...prev, [name]: fieldError }));
    }
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const fieldError = validateField(name as keyof FormData, value);
    setErrors((prev) => ({ ...prev, [name]: fieldError }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Touch all fields to reveal any hidden errors
    setTouched({ full_name: true, phone: true, bio: true, dob: true });

    const { isValid, errors: validationErrors } = validateEditProfileForm(formData);
    setErrors(validationErrors);
    if (!isValid) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    const payload: {
      full_name?: string;
      phone?: string;
      bio?: string;
      dob?: string;
    } = {};
    if (formData.full_name !== initialData?.full_name) payload.full_name = formData.full_name;
    if (formData.phone !== initialData?.phone) payload.phone = formData.phone;
    if (formData.bio !== initialData?.bio) payload.bio = formData.bio;
    if (formData.dob !== initialData?.dob) payload.dob = formData.dob;

    const res = await profileService.updateUserProfile(payload);
    setIsSubmitting(false);

    if (!res.success) {
      const apiErr = res as unknown as {
        error?: string;
        errors?: FormErrors;
      };
      if (apiErr.errors) {
        setErrors(apiErr.errors);
      }
      setSubmitError(apiErr.error || "Failed to update profile. Please try again.");
      return;
    }

    setSuccessMessage("Profile updated successfully!");
    setInitialData({ ...formData });

    // Sync the navbar name immediately if full_name changed
    if (formData.full_name !== initialData?.full_name) {
      onProfileUpdate?.(formData.full_name);
    }

    setTimeout(() => onNavigate("/profile/me"), 1500);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
        <p className="mt-4 text-slate-500 font-medium">Loading profile…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4">
        <div className="glass-panel p-8 rounded-[3rem] text-center max-w-md">
          <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Could Not Load Profile
          </h2>
          <p className="text-slate-500 mb-6">{loadError}</p>
          <button
            onClick={() => onNavigate("/profile/me")}
            className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all"
          >
            Back to Profile
          </button>
        </div>
      </div>
    );
  }

  const bioLength = formData.bio.length;
  const bioColorClass =
    bioLength > 500 ? "text-red-500" : bioLength > 400 ? "text-amber-500" : "text-slate-400";

  const isDisabled = isSubmitting || !hasChanges || Object.values(errors).some(Boolean);

  return (
    <div className="min-h-[calc(100vh-140px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => onNavigate("/profile/me")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium mb-8 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Profile
        </button>

        <div className="glass-panel rounded-[3rem] overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-700 h-24 flex items-center px-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Edit Profile</h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="px-8 py-8 space-y-6">
            {/* Success banner */}
            {successMessage && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                <p className="text-sm font-semibold text-emerald-700">{successMessage}</p>
              </div>
            )}

            {/* Submit error banner */}
            {submitError && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                <p className="text-sm font-semibold text-red-700">{submitError}</p>
              </div>
            )}

            {/* Full Name */}
            <div>
              <label
                htmlFor="full_name"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"
              >
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                value={formData.full_name}
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={100}
                placeholder="Your full name"
                className={`w-full px-4 py-3 rounded-2xl border text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition ${
                  touched.full_name && errors.full_name
                    ? "border-red-400 bg-red-50"
                    : "border-slate-200 bg-white"
                }`}
              />
              {touched.full_name && errors.full_name && (
                <p className="mt-1.5 text-xs text-red-500 font-medium">
                  {errors.full_name}
                </p>
              )}
            </div>

            {/* Email (read-only) */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                readOnly
                disabled
                className="w-full px-4 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Email is managed through your account settings and cannot be changed here.
              </p>
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor="phone"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"
              >
                Phone <span className="text-slate-300 font-normal normal-case">(optional)</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="(555) 123-4567"
                className={`w-full px-4 py-3 rounded-2xl border text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition ${
                  touched.phone && errors.phone
                    ? "border-red-400 bg-red-50"
                    : "border-slate-200 bg-white"
                }`}
              />
              {touched.phone && errors.phone && (
                <p className="mt-1.5 text-xs text-red-500 font-medium">
                  {errors.phone}
                </p>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label
                htmlFor="dob"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"
              >
                Date of Birth <span className="text-slate-300 font-normal normal-case">(optional)</span>
              </label>
              <input
                id="dob"
                name="dob"
                type="date"
                value={formData.dob}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`w-full px-4 py-3 rounded-2xl border text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition ${
                  touched.dob && errors.dob
                    ? "border-red-400 bg-red-50"
                    : "border-slate-200 bg-white"
                }`}
              />
              {touched.dob && errors.dob && (
                <p className="mt-1.5 text-xs text-red-500 font-medium">
                  {errors.dob}
                </p>
              )}
            </div>

            {/* Bio */}
            <div>
              <label
                htmlFor="bio"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"
              >
                Bio <span className="text-slate-300 font-normal normal-case">(optional)</span>
              </label>
              <textarea
                id="bio"
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                onBlur={handleBlur}
                rows={4}
                maxLength={520}
                placeholder="Tell others a little about yourself…"
                className={`w-full px-4 py-3 rounded-2xl border text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none transition ${
                  touched.bio && errors.bio
                    ? "border-red-400 bg-red-50"
                    : "border-slate-200 bg-white"
                }`}
              />
              <div className="flex items-center justify-between mt-1.5">
                {touched.bio && errors.bio ? (
                  <p className="text-xs text-red-500 font-medium">{errors.bio}</p>
                ) : (
                  <span />
                )}
                <p className={`text-xs font-medium ${bioColorClass}`}>
                  {bioLength}/500
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate("/profile/me")}
                className="px-6 py-3 rounded-full font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDisabled}
                className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-bold rounded-full hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSubmitting ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
