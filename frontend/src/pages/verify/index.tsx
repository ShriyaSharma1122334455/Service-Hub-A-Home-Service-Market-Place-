import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  User as UserIcon,
  Upload,
  Camera,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Shield,
  FileText,
  ScanFace,
  Send,
  PartyPopper,
} from "lucide-react";
import fetchApi from "../../lib/api";

interface VerifyPageProps {
  userId: string;
  onNavigate: (path: string) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = [
  "Personal Info",
  "Upload ID",
  "Selfie",
  "Review",
  "Complete",
];

// ── Progress Bar ─────────────────────────────────────────────────────────

const ProgressBar: React.FC<{ current: Step }> = ({ current }) => (
  <div className="flex items-center gap-1 mb-8">
    {STEP_LABELS.map((label, i) => {
      const stepNum = (i + 1) as Step;
      const isActive = stepNum === current;
      const isDone = stepNum < current;
      return (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                ${isDone ? "bg-teal-600 border-teal-600 text-white" : ""}
                ${isActive ? "bg-white border-teal-600 text-teal-600 shadow-md scale-110" : ""}
                ${!isDone && !isActive ? "bg-slate-100 border-slate-200 text-slate-400" : ""}`}
            >
              {isDone ? <CheckCircle2 size={16} /> : stepNum}
            </div>
            <span
              className={`text-[10px] font-semibold mt-1 whitespace-nowrap
                ${isActive ? "text-teal-600" : "text-slate-400"}`}
            >
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div
              className={`h-0.5 flex-1 -mt-4 rounded-full transition-all
                ${stepNum < current ? "bg-teal-500" : "bg-slate-200"}`}
            />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────

export const VerifyPage: React.FC<VerifyPageProps> = ({
  userId,
  onNavigate,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [prefill, setPrefill] = useState<{
    fullName: string;
    email: string;
    phone: string | null;
  } | null>(null);
  const [documentType, setDocumentType] = useState<string>("drivers_license");

  // Step 2 state
  const [idFile, setIdFile] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<{
    extractedName?: string;
    extractedDob?: string;
    documentPath?: string;
    ocrResult?: { confidence_score?: number; extracted_data?: { id_number?: string } };
  } | null>(null);

  // Step 3 state
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [faceResult, setFaceResult] = useState<{
    faceMatchResult?: {
      similarity_score?: number;
      is_match?: boolean;
      status?: string;
    };
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Step 4 state
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  // ── Step 1: Load prefill data ────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const resp = await fetchApi<{
        fullName: string;
        email: string;
        phone: string | null;
      }>(`/verification/prefill/${userId}`);

      if (!cancelled) {
        if (resp.success && resp.data) {
          setPrefill(resp.data);
        } else {
          setError(resp.error || "Failed to load user data");
        }
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Step 2: Upload ID ────────────────────────────────────────────────

  const handleIdUpload = async () => {
    if (!idFile) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("document", idFile);
    formData.append("documentType", documentType);

    try {
      const { data: { session } } = await (await import("../../lib/supabase")).supabase.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch(`${API_BASE}/api/verification/upload-id`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const json = await resp.json();

      if (json.success) {
        setOcrResult(json.data);
      } else {
        setError(json.error || "Failed to process ID document");
      }
    } catch (err) {
      setError("Network error uploading ID document");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Camera / Selfie ──────────────────────────────────────────

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setCameraError(false);
    } catch {
      setCameraError(true);
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setSelfieBlob(blob);
          stopCamera();
        }
      },
      "image/jpeg",
      0.9,
    );
  }, [stopCamera]);

  useEffect(() => {
    if (step === 3 && !selfieBlob && !cameraError) {
      startCamera();
    }
    return () => {
      if (step !== 3) stopCamera();
    };
  }, [step, selfieBlob, cameraError, startCamera, stopCamera]);

  const handleSelfieUpload = async (blob: Blob) => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("selfie", blob, "selfie.jpg");

    try {
      const { data: { session } } = await (await import("../../lib/supabase")).supabase.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch(`${API_BASE}/api/verification/upload-selfie`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const json = await resp.json();
      if (json.success) {
        setFaceResult(json.data);
      } else {
        setError(json.error || "Failed to process selfie");
      }
    } catch {
      setError("Network error uploading selfie");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelfieFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieBlob(file);
    await handleSelfieUpload(file);
  };

  // ── Step 4: Submit ───────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    const resp = await fetchApi<{ submittedAt: string }>(`/verification/submit`, {
      method: "POST",
    });

    if (resp.success && resp.data) {
      setSubmittedAt(resp.data.submittedAt);
      setStep(5);
    } else {
      setError(resp.error || "Failed to submit verification");
    }
    setSubmitting(false);
  };

  // ── Render Steps ─────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <UserIcon className="h-7 w-7 text-teal-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Personal Information</h2>
        <p className="text-sm text-slate-500 mt-1">
          Confirm your details before starting verification
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
        </div>
      ) : prefill ? (
        <>
          <div className="space-y-3">
            {[
              { label: "Full Name", value: prefill.fullName },
              { label: "Email", value: prefill.email },
              { label: "Phone", value: prefill.phone || "Not provided" },
            ].map((field) => (
              <div key={field.label} className="p-3 bg-slate-50 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {field.label}
                </p>
                <p className="text-sm font-medium text-slate-800 mt-0.5">
                  {field.value}
                </p>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 rounded-xl">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Document Type
            </p>
            <div className="flex gap-3">
              {[
                { value: "drivers_license", label: "Driver's License" },
                { value: "passport", label: "Passport" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDocumentType(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all
                    ${documentType === opt.value
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
          >
            Continue <ArrowRight size={16} />
          </button>
        </>
      ) : null}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <FileText className="h-7 w-7 text-teal-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Upload ID Document</h2>
        <p className="text-sm text-slate-500 mt-1">
          Upload a clear photo of your {documentType === "passport" ? "passport" : "driver's license"}
        </p>
      </div>

      {!ocrResult ? (
        <>
          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-all">
            <Upload className="h-10 w-10 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-600">
              {idFile ? idFile.name : "Click to select file"}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              JPEG, PNG, or WebP · Max 5MB
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 5 * 1024 * 1024) {
                    setError("File too large. Maximum 5MB.");
                    return;
                  }
                  setError(null);
                  setIdFile(f);
                }
              }}
            />
          </label>

          <button
            disabled={!idFile || loading}
            onClick={handleIdUpload}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Processing...
              </>
            ) : (
              <>
                Scan Document <ArrowRight size={16} />
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <p className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
              <CheckCircle2 size={16} /> Document Scanned Successfully
            </p>
            <div className="space-y-2 text-sm">
              <p className="text-slate-700">
                <span className="font-medium">Name:</span>{" "}
                {ocrResult.extractedName || "—"}
              </p>
              <p className="text-slate-700">
                <span className="font-medium">DOB:</span>{" "}
                {ocrResult.extractedDob || "—"}
              </p>
              {ocrResult.ocrResult?.extracted_data?.id_number && (
                <p className="text-slate-700">
                  <span className="font-medium">ID Number:</span>{" "}
                  {ocrResult.ocrResult.extracted_data.id_number}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setOcrResult(null);
                setIdFile(null);
              }}
              className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:border-slate-300 transition-colors"
            >
              <RotateCcw size={14} /> Re-upload
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
            >
              Confirm <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => setStep(1)}
        className="w-full text-sm text-slate-400 hover:text-slate-600 font-medium flex items-center justify-center gap-1"
      >
        <ArrowLeft size={14} /> Back
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <ScanFace className="h-7 w-7 text-teal-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Take a Selfie</h2>
        <p className="text-sm text-slate-500 mt-1">
          We'll match your face with your ID document
        </p>
      </div>

      {!faceResult ? (
        <>
          {cameraError ? (
            /* File upload fallback */
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
                Camera access denied. Please upload a selfie instead.
              </div>
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-teal-400 transition-all">
                <Camera className="h-8 w-8 text-slate-400 mb-2" />
                <span className="text-sm font-semibold text-slate-600">
                  Upload Selfie
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileSelfieFallback}
                />
              </label>
            </div>
          ) : (
            /* Camera viewfinder */
            <div className="flex flex-col items-center">
              <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-teal-500 shadow-lg mx-auto">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!cameraActive && (
                  <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
                  </div>
                )}
              </div>

              <button
                disabled={!cameraActive || loading}
                onClick={capturePhoto}
                className="mt-6 w-full max-w-xs py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                <Camera size={16} /> Take Photo
              </button>
            </div>
          )}

          {selfieBlob && !faceResult && (
            <div className="flex justify-center">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Matching face...
                </div>
              ) : (
                <button
                  onClick={() => handleSelfieUpload(selfieBlob)}
                  className="py-3 px-6 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 transition-colors"
                >
                  Upload & Match
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className={`p-4 rounded-2xl border ${
              faceResult.faceMatchResult?.is_match
                ? "bg-emerald-50 border-emerald-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <p
              className={`text-sm font-bold mb-2 flex items-center gap-2 ${
                faceResult.faceMatchResult?.is_match
                  ? "text-emerald-700"
                  : "text-red-700"
              }`}
            >
              {faceResult.faceMatchResult?.is_match ? (
                <CheckCircle2 size={16} />
              ) : (
                <XCircle size={16} />
              )}
              {faceResult.faceMatchResult?.is_match
                ? "Face Match Successful"
                : "Face Match Failed"}
            </p>
            <p className="text-sm text-slate-600">
              Similarity:{" "}
              {faceResult.faceMatchResult?.similarity_score?.toFixed(1) ?? "—"}%
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setFaceResult(null);
                setSelfieBlob(null);
                setCameraError(false);
              }}
              className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} /> Retake
            </button>
            <button
              onClick={() => setStep(4)}
              className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => {
          stopCamera();
          setStep(2);
        }}
        className="w-full text-sm text-slate-400 hover:text-slate-600 font-medium flex items-center justify-center gap-1"
      >
        <ArrowLeft size={14} /> Back
      </button>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Shield className="h-7 w-7 text-teal-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Review & Submit</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review your verification details before submitting
        </p>
      </div>

      {/* OCR Summary */}
      <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <FileText size={12} /> Document OCR
          <CheckCircle2 size={12} className="text-emerald-500 ml-auto" />
        </p>
        <p className="text-sm text-slate-700">
          Name: <span className="font-medium">{ocrResult?.extractedName || "—"}</span>
        </p>
        <p className="text-sm text-slate-700">
          DOB: <span className="font-medium">{ocrResult?.extractedDob || "—"}</span>
        </p>
      </div>

      {/* Face Match Summary */}
      <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <ScanFace size={12} /> Face Match
          {faceResult?.faceMatchResult?.is_match ? (
            <CheckCircle2 size={12} className="text-emerald-500 ml-auto" />
          ) : (
            <XCircle size={12} className="text-red-500 ml-auto" />
          )}
        </p>
        <p className="text-sm text-slate-700">
          Similarity:{" "}
          <span className="font-medium">
            {faceResult?.faceMatchResult?.similarity_score?.toFixed(1) ?? "—"}%
          </span>
        </p>
      </div>

      {/* NSOPW Note */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        ⚠️ A background check (NSOPW) will run automatically when you submit.
      </div>

      <button
        disabled={submitting}
        onClick={handleSubmit}
        className="w-full py-3 bg-teal-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Submitting...
          </>
        ) : (
          <>
            <Send size={16} /> Submit for Verification
          </>
        )}
      </button>

      <button
        onClick={() => setStep(3)}
        className="w-full text-sm text-slate-400 hover:text-slate-600 font-medium flex items-center justify-center gap-1"
      >
        <ArrowLeft size={14} /> Back
      </button>
    </div>
  );

  const renderStep5 = () => (
    <div className="text-center space-y-6 py-8">
      <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
        <PartyPopper className="h-10 w-10 text-emerald-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Verification Submitted!
        </h2>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          Your identity verification is now under review. You'll be notified
          once it's complete.
        </p>
      </div>

      {submittedAt && (
        <p className="text-xs text-slate-400">
          Submitted: {new Date(submittedAt).toLocaleString()}
        </p>
      )}

      <button
        onClick={() => onNavigate("/profile/me")}
        className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
      >
        Back to Profile
      </button>
    </div>
  );

  // ── Main Render ──────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-140px)] py-12 px-4">
      <div className="max-w-md mx-auto">
        <ProgressBar current={step} />

        <div className="glass-panel rounded-3xl p-6 sm:p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
              <XCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>
      </div>
    </div>
  );
};
