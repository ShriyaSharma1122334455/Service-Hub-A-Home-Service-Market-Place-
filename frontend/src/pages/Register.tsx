import React, { useState, useEffect } from "react";
import { UserRole } from "../../types";
import {
  Lock,
  Mail,
  User,
  Phone,
  Building2,
  FileText,
  ChevronRight,
  ChevronLeft,
  Check,
  Wrench,
  Zap,
  SprayCan,
  Bug,
  MapPin,
  Eye,
  EyeOff,
} from "lucide-react";

interface CategoryService {
  category: string;
  description: string;
  price: string;
}

interface RegisterProps {
  onRegister: (
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
    providerMeta?: {
      businessName: string;
      description: string;
      services: CategoryService[];
    },
  ) => Promise<{ success: boolean; message?: string }>;
  onLoginClick: () => void;
}
const CATEGORIES = [
  {
    name: "Plumbing",
    icon: <Wrench className="w-5 h-5" />,
    placeholder:
      "e.g. Emergency leak repair, drain unclogging, pipe fitting...",
    lightBg: "bg-blue-50",
    border: "border-blue-200",
    activeBorder: "border-blue-400",
    activeText: "text-blue-700",
    activeBg: "bg-blue-500",
    checkBorder: "border-blue-400",
  },
  {
    name: "Electrical",
    icon: <Zap className="w-5 h-5" />,
    placeholder: "e.g. Outlet installation, panel upgrades, wiring repair...",
    lightBg: "bg-yellow-50",
    border: "border-yellow-200",
    activeBorder: "border-yellow-400",
    activeText: "text-yellow-700",
    activeBg: "bg-yellow-500",
    checkBorder: "border-yellow-400",
  },
  {
    name: "Cleaning",
    icon: <SprayCan className="w-5 h-5" />,
    placeholder: "e.g. Kitchen deep clean, bathroom scrub, move-in/out...",
    lightBg: "bg-green-50",
    border: "border-green-200",
    activeBorder: "border-green-400",
    activeText: "text-green-700",
    activeBg: "bg-green-500",
    checkBorder: "border-green-400",
  },
  {
    name: "Pest Control",
    icon: <Bug className="w-5 h-5" />,
    placeholder:
      "e.g. Ant/roach removal, rodent trapping, preventive spraying...",
    lightBg: "bg-red-50",
    border: "border-red-200",
    activeBorder: "border-red-400",
    activeText: "text-red-700",
    activeBg: "bg-red-500",
    checkBorder: "border-red-400",
  },
];

const StepIndicator = ({
  current,
  labels,
}: {
  current: number;
  labels: string[];
}) => (
  <div className="flex items-center justify-center gap-0 mb-8">
    {labels.map((label, i) => (
      <React.Fragment key={i}>
        <div className="flex flex-col items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              i < current
                ? "bg-slate-900 text-white"
                : i === current
                  ? "bg-slate-900 text-white ring-4 ring-slate-200"
                  : "bg-slate-100 text-slate-400"
            }`}
          >
            {i < current ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          <span
            className={`text-[10px] mt-1 font-semibold tracking-wide ${i === current ? "text-slate-900" : "text-slate-400"}`}
          >
            {label}
          </span>
        </div>
        {i < labels.length - 1 && (
          <div
            className={`w-10 h-0.5 mb-4 transition-all duration-300 ${i < current ? "bg-slate-900" : "bg-slate-200"}`}
          />
        )}
      </React.Fragment>
    ))}
  </div>
);

const Field = ({
  label,
  icon,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  icon: React.ReactNode;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-300">
          {icon}
        </div>
        <input
          type={inputType}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`glass-input block w-full pl-11 ${isPassword ? "pr-12" : "pr-4"} py-4 rounded-2xl text-sm font-bold text-slate-900`}
          onKeyDown={type === "date" ? (e) => e.preventDefault() : undefined}
          onPaste={type === "date" ? (e) => e.preventDefault() : undefined}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1 ml-1">{error}</p>}
    </div>
  );
};

const Notification = ({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) => (
  <div className="fixed top-5 right-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl shadow-lg flex items-center gap-3 z-50 max-w-sm">
    <span className="text-sm font-medium">{message}</span>
    <button
      onClick={onClose}
      className="text-red-400 hover:text-red-600 ml-auto shrink-0"
    >
      ✕
    </button>
  </div>
);

export const Register: React.FC<RegisterProps> = ({
  onRegister,
  onLoginClick,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [bizDescription, setBizDescription] = useState("");
  const [categoryServices, setCategoryServices] = useState<
    Record<string, { description: string; price: string }>
  >({});

  const [notification, setNotification] = useState<{
    message: string;
    type: "error";
  } | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const steps =
    role === UserRole.PROVIDER
      ? ["Account", "Business", "Services"]
      : ["Account"];
  const isLastStep = role === UserRole.CUSTOMER ? step === 0 : step === 2;

  const isSelected = (cat: string) => cat in categoryServices;

  const toggleCategory = (cat: string) => {
    setCategoryServices((prev) => {
      const next = { ...prev };
      if (cat in next) delete next[cat];
      else next[cat] = { description: "", price: "" };
      return next;
    });
  };

  const updateField = (
    cat: string,
    field: "description" | "price",
    val: string,
  ) => {
    setCategoryServices((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [field]: val },
    }));
  };

  const handleFieldChange = (field: string, value: string) => {
    switch (field) {
      case "name":
        setName(value);
        break;
      case "email":
        setEmail(value);
        break;
      case "phone":
        setPhone(value);
        break;
      case "dob":
        setDob(value);
        break;
      case "street":
        setStreet(value);
        break;
      case "city":
        setCity(value);
        break;
      case "state":
        setState(value);
        break;
      case "zip":
        setZip(value);
        break;
      case "password":
        setPassword(value);
        break;
    }
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const selectedCats = Object.keys(categoryServices);

  // ── Validation ────────────────────────────────────────────────────────────

  const validateStep0 = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Full name is required.";
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setNotification({
        message: "Valid email address is required.",
        type: "error",
      });
      return false;
    }

    const normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      newErrors.phone = "Enter a valid phone number (10–15 digits).";
    }

    if (!dob.trim()) {
      newErrors.dob = "You must be at least 18 years old.";
    } else {
      const parsedDob = new Date(dob);
      const isValidDob =
        !Number.isNaN(parsedDob.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dob);
      if (!isValidDob) {
        newErrors.dob = "You must be at least 18 years old.";
      } else {
        const today = new Date();
        let age = today.getFullYear() - parsedDob.getFullYear();
        const monthDiff = today.getMonth() - parsedDob.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < parsedDob.getDate())
        ) {
          age -= 1;
        }
        if (age < 18) {
          newErrors.dob = "You must be at least 18 years old.";
        }
      }
    }

    if (!street.trim()) {
      newErrors.street = "Street address is required.";
    }
    if (!city.trim()) {
      newErrors.city = "City is required.";
    }
    if (!state.trim()) {
      newErrors.state = "State is required.";
    }
    if (!zip.trim()) {
      newErrors.zip = "ZIP code is required.";
    } else if (!/^\d{5}$/.test(zip)) {
      newErrors.zip = "ZIP code must be 5 digits.";
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

    if (!passwordRegex.test(password)) {
      setNotification({
        message:
          "Password must include uppercase, lowercase, number, and special character",
        type: "error",
      });
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep1 = () => {
    if (!businessName.trim()) {
      setNotification({
        message: "Business name is required.",
        type: "error",
      });
      return false;
    }
    if (!bizDescription.trim()) {
      setNotification({
        message: "Business description is required.",
        type: "error",
      });
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (selectedCats.length === 0) {
      setNotification({
        message: "Select at least one service category.",
        type: "error",
      });
      return false;
    }
    for (const cat of selectedCats) {
      if (!categoryServices[cat].description.trim()) {
        setNotification({
          message: `Describe your ${cat} services.`,
          type: "error",
        });
        return false;
      }
      if (
        !categoryServices[cat].price ||
        Number(categoryServices[cat].price) <= 0
      ) {
        setNotification({
          message: `Enter a valid starting price for ${cat}.`,
          type: "error",
        });
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !validateStep0()) return;
    if (step === 1 && !validateStep1()) return;
    setNotification(null);
    setStep((s) => s + 1);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleFinalSubmit = async () => {
    if (role === UserRole.CUSTOMER) {
      if (!validateStep0()) return;
    } else {
      if (!validateStep2()) return;
    }
    setLoading(true);

    try {
      // Pass all fields to the registration handler
      const result = await onRegister(
        email,
        role,
        password,
        name,
        phone,
        dob,
        street,
        city,
        state,
        zip,
        role === UserRole.PROVIDER
          ? {
              businessName,
              description: bizDescription,
              services: selectedCats.map((cat) => ({
                category: cat,
                description: categoryServices[cat].description,
                price: categoryServices[cat].price,
              })),
            }
          : undefined,
      );
      if (!result.success) {
        setNotification({
          message: result.message || "Registration failed. Please try again.",
          type: "error",
        });
      }
    } catch (error) {
      setNotification({
        message: "An unexpected error occurred. Please try again.",
        type: "error",
      });
      console.error("Registration failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderStep0 = () => {
    const dobParts = dob ? dob.split("-") : [];
    const dobYear = dobParts[0] || "";
    const dobMonth = dobParts[1] || "";
    const dobDay = dobParts[2] || "";

    return (
      <div className="space-y-5">
        <Field
          label="Full Name"
          icon={<User className="h-5 w-5" />}
        value={name}
        onChange={(value) => handleFieldChange("name", value)}
        placeholder="John Doe"
        error={errors.name}
      />
      <Field
        label="Email Address"
        icon={<Mail className="h-5 w-5" />}
        value={email}
        onChange={(value) => handleFieldChange("email", value)}
        placeholder="name@example.com"
        type="email"
        error={errors.email}
      />
      <Field
        label="Phone Number"
        icon={<Phone className="h-5 w-5" />}
        value={phone}
        onChange={(value) => handleFieldChange("phone", value)}
        placeholder="+1 (555) 000-0000"
        type="tel"
        error={errors.phone}
      />
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2">
          Date of Birth
        </label>
        <div className="flex flex-row gap-2">
          <select
            value={dobMonth || ""}
            onChange={(e) => {
              const newMonth = e.target.value;
              const newDate = (dobYear || newMonth || dobDay) ? `${dobYear}-${newMonth}-${dobDay}` : "";
              handleFieldChange("dob", newDate);
            }}
            className={`glass-input flex-[2] rounded-2xl py-4 px-4 text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-slate-900 ${errors.dob ? "border-2 border-red-400" : ""} ${!dobMonth ? "text-slate-400" : "text-slate-900"}`}
          >
            <option value="" disabled className="text-slate-400">Month</option>
            {[
              { v: "01", l: "January" }, { v: "02", l: "February" }, { v: "03", l: "March" },
              { v: "04", l: "April" }, { v: "05", l: "May" }, { v: "06", l: "June" },
              { v: "07", l: "July" }, { v: "08", l: "August" }, { v: "09", l: "September" },
              { v: "10", l: "October" }, { v: "11", l: "November" }, { v: "12", l: "December" }
            ].map(m => <option key={m.v} value={m.v} className="text-slate-900">{m.l}</option>)}
          </select>

          <select
            value={dobDay || ""}
            onChange={(e) => {
              const newDay = e.target.value;
              const newDate = (dobYear || dobMonth || newDay) ? `${dobYear}-${dobMonth}-${newDay}` : "";
              handleFieldChange("dob", newDate);
            }}
            className={`glass-input flex-1 rounded-2xl py-4 px-4 text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-slate-900 ${errors.dob ? "border-2 border-red-400" : ""} ${!dobDay ? "text-slate-400" : "text-slate-900"}`}
          >
            <option value="" disabled className="text-slate-400">Day</option>
            {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map(d => (
              <option key={d} value={d} className="text-slate-900">{d}</option>
            ))}
          </select>

          <select
            value={dobYear || ""}
            onChange={(e) => {
              const newYear = e.target.value;
              const newDate = (newYear || dobMonth || dobDay) ? `${newYear}-${dobMonth}-${dobDay}` : "";
              handleFieldChange("dob", newDate);
            }}
            className={`glass-input flex-1 rounded-2xl py-4 px-4 text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-slate-900 ${errors.dob ? "border-2 border-red-400" : ""} ${!dobYear ? "text-slate-400" : "text-slate-900"}`}
          >
            <option value="" disabled className="text-slate-400">Year</option>
            {Array.from({ length: 100 - 18 + 1 }, (_, i) => String(new Date().getFullYear() - 18 - i)).map(y => (
              <option key={y} value={y} className="text-slate-900">{y}</option>
            ))}
          </select>
        </div>
        {errors.dob && <p className="text-xs text-red-600 mt-2 ml-1">{errors.dob}</p>}
      </div>

      <Field
        label="Street"
        icon={<MapPin className="h-5 w-5" />}
        value={street}
        onChange={(value) => handleFieldChange("street", value)}
        placeholder="123 Main St"
        error={errors.street}
      />
      <Field
        label="City"
        icon={<MapPin className="h-5 w-5" />}
        value={city}
        onChange={(value) => handleFieldChange("city", value)}
        placeholder="New York"
        error={errors.city}
      />
      <Field
        label="State"
        icon={<MapPin className="h-5 w-5" />}
        value={state}
        onChange={(value) => handleFieldChange("state", value)}
        placeholder="NY"
        error={errors.state}
      />
      <Field
        label="ZIP"
        icon={<MapPin className="h-5 w-5" />}
        value={zip}
        onChange={(value) => handleFieldChange("zip", value)}
        placeholder="10001"
        error={errors.zip}
      />
      <Field
        label="Password"
        icon={<Lock className="h-5 w-5" />}
        value={password}
        onChange={(value) => handleFieldChange("password", value)}
        placeholder="Min. 8 characters"
        type="password"
        error={errors.password}
      />
    </div>
    );
  };

  const renderStep1 = () => (
    <div className="space-y-5">
      <Field
        label="Business Name"
        icon={<Building2 className="h-5 w-5" />}
        value={businessName}
        onChange={setBusinessName}
        placeholder="Rivera Plumbing & Electric"
      />
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2">
          Business Description
        </label>
        <div className="relative">
          <div className="absolute top-4 left-4 text-slate-300">
            <FileText className="h-5 w-5" />
          </div>
          <textarea
            required
            value={bizDescription}
            onChange={(e) => setBizDescription(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Tell customers about your experience, certifications, and what makes your service stand out..."
            className="glass-input block w-full pl-11 pr-4 py-4 rounded-2xl text-sm font-bold text-slate-900 resize-none"
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5 ml-1">
          {bizDescription.length} / 500
        </p>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">
        Select the categories you work in. For each one, describe your specific
        services and set a starting price.
      </p>

      {CATEGORIES.map((cat) => {
        const selected = isSelected(cat.name);
        return (
          <div
            key={cat.name}
            className={`rounded-2xl border-2 transition-all duration-200 overflow-hidden ${selected ? cat.activeBorder : "border-slate-100"}`}
          >
            {/* Header row — click to toggle */}
            <button
              type="button"
              onClick={() => toggleCategory(cat.name)}
              className={`w-full flex items-center gap-3 p-4 text-left transition-all ${selected ? cat.lightBg : "bg-white hover:bg-slate-50"}`}
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? `${cat.activeBg} border-transparent` : "border-slate-300"}`}
              >
                {selected && <Check className="w-3 h-3 text-white" />}
              </div>
              <span
                className={`flex items-center gap-2 text-sm font-bold ${selected ? cat.activeText : "text-slate-700"}`}
              >
                <span className={selected ? cat.activeText : "text-slate-400"}>
                  {cat.icon}
                </span>
                {cat.name}
              </span>
              {selected && (
                <span className="ml-auto text-xs text-slate-400 font-medium">
                  tap to remove
                </span>
              )}
            </button>

            {/* Expanded fields */}
            {selected && (
              <div className={`px-4 pb-4 pt-1 space-y-3 ${cat.lightBg}`}>
                <div className={`h-px ${cat.border}`} />

                {/* What they offer */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Describe your {cat.name} services
                  </label>
                  <input
                    type="text"
                    value={categoryServices[cat.name]?.description || ""}
                    onChange={(e) =>
                      updateField(cat.name, "description", e.target.value)
                    }
                    placeholder={cat.placeholder}
                    className="w-full px-4 py-3 rounded-xl border-2 border-white bg-white text-sm font-medium text-slate-800 placeholder-slate-300 focus:outline-none focus:border-slate-300 transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-1 ml-1">
                    Customers will see this on your profile
                  </p>
                </div>

                {/* Starting price */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Starting price per visit
                  </label>
                  <div className="relative max-w-[160px]">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={categoryServices[cat.name]?.price || ""}
                      onChange={(e) =>
                        updateField(cat.name, "price", e.target.value)
                      }
                      placeholder="99"
                      className="w-full pl-7 pr-4 py-3 rounded-xl border-2 border-white bg-white text-sm font-bold text-slate-800 placeholder-slate-300 focus:outline-none focus:border-slate-300 transition-all"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1 ml-1">
                    You can adjust this per booking later
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Selected summary */}
      {selectedCats.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-400">Selected:</span>
          {selectedCats.map((cat) => (
            <span
              key={cat}
              className="text-xs font-bold bg-slate-900 text-white px-3 py-1 rounded-full"
            >
              {cat}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {notification && (
        <Notification
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="min-h-[calc(100vh-140px)] flex flex-col justify-center items-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <div className="h-14 w-14 bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-2xl tracking-tighter">
                  S
                </span>
              </div>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              Create account
            </h2>
            <p className="mt-2 text-slate-500 text-sm font-medium">
              Already have an account?{" "}
              <button
                onClick={onLoginClick}
                className="font-bold text-slate-900 hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>

          {/* Role toggle — step 0 only */}
          {step === 0 && (
            <div className="flex justify-center mb-6">
              <div className="inline-flex bg-slate-100 p-1 rounded-full shadow-sm">
                {[
                  { label: "User", val: UserRole.CUSTOMER },
                  { label: "Provider", val: UserRole.PROVIDER },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setRole(opt.val)}
                    className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${role === opt.val ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step indicator — provider only */}
          {role === UserRole.PROVIDER && (
            <StepIndicator current={step} labels={steps} />
          )}

          {/* Card */}
          <div className="glass-panel py-8 px-6 sm:px-8 rounded-[2.5rem]">
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">
                  {step === 0
                    ? "Your details"
                    : step === 1
                      ? "Your business"
                      : "What you offer"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {step === 0 &&
                    role === UserRole.CUSTOMER &&
                    "Set up your homeowner account"}
                  {step === 0 &&
                    role === UserRole.PROVIDER &&
                    "Start with your personal information"}
                  {step === 1 && "Help customers understand your business"}
                  {step === 2 &&
                    "Your categories, services, and starting prices"}
                </p>
              </div>

              {step === 0 && renderStep0()}
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}

              <div
                className={`flex gap-3 mt-7 ${step > 0 ? "justify-between" : ""}`}
              >
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="flex items-center gap-2 px-5 py-3 rounded-full border-2 border-slate-200 text-sm font-bold text-slate-600 hover:border-slate-400 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                )}
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={loading}
                    className="flex-1 py-4 px-4 rounded-full shadow-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8z"
                          />
                        </svg>{" "}
                        Creating account...
                      </>
                    ) : (
                      <>
                        {role === UserRole.PROVIDER
                          ? "Launch my profile"
                          : "Create account"}{" "}
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 flex items-center justify-center gap-2 py-4 px-4 rounded-full shadow-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>

          {role === UserRole.PROVIDER && (
            <p className="text-center text-xs text-slate-400 mt-4">
              Step {step + 1} of {steps.length} — {steps[step]}
            </p>
          )}
        </div>
      </div>
    </>
  );
};
