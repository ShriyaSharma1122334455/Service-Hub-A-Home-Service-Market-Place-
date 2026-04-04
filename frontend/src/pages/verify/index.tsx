import React, { useState, useEffect, useRef } from "react";
import fetchApi from "../../lib/api";
import { supabase } from "../../lib/supabase";
import {
  Camera,
  Upload,
  Check,
  ChevronRight,
  X,
  AlertCircle,
  Loader2,
  FileImage,
} from "lucide-react";

interface VerifyPageProps {
  userId: string;
  onNavigate: (path: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const VerifyPage: React.FC<VerifyPageProps> = ({ userId, onNavigate }) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Prefill & Doc Type
  const [prefill, setPrefill] = useState<{
    fullName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
  } | null>(null);
  const [documentType, setDocumentType] = useState<"" | "passport" | "drivers_license">("");

  // Step 2: ID Upload
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<any>(null);

  // Step 3: Selfie Capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [faceMatchResult, setFaceMatchResult] = useState<any>(null);

  // Step 5: Confirmation
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  // --- Step 1 logic ---
  useEffect(() => {
    if (!userId) return;

    let mounted = true;
    const fetchPrefill = async () => {
      setLoading(true);
      setError(null);
      const res = await fetchApi<any>(`/verification/prefill/${userId}`);
      if (!mounted) return;
      if (res.success && res.data) {
        setPrefill({
          fullName: res.data.fullName || "",
          email: res.data.email || "",
          phone: res.data.phone || "",
          dateOfBirth: res.data.dateOfBirth || "",
        });
      } else {
        setError(res.error || "Failed to load prefill data.");
      }
      setLoading(false);
    };

    fetchPrefill();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // --- Step 2 logic ---
  const handleIdDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    validateAndSetId(file);
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetId(e.target.files[0]);
    }
  };

  const validateAndSetId = (file: File) => {
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please upload a valid image (JPEG, PNG, WEBP).");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("File is too large. Maximum size is 5MB.");
      return;
    }
    setIdFile(file);
    setIdPreview(URL.createObjectURL(file));
  };

  const uploadIdAndScan = async () => {
    if (!idFile || !documentType) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("document", idFile);
    formData.append("documentType", documentType);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch(`${API_BASE}/api/verification/upload-id`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setOcrResult(json.data.ocrResult);
      } else {
        setError(json.error || "Failed to upload ID document.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  // --- Step 3 logic ---
  const startCamera = async () => {
    setCameraDenied(false);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access denied or failed", err);
      setCameraDenied(true);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            setSelfieBlob(blob);
            setSelfiePreview(URL.createObjectURL(blob));
            stopCamera();
          }
        }, "image/jpeg");
      }
    }
  };

  const retakePhoto = () => {
    setSelfieBlob(null);
    setSelfiePreview(null);
    startCamera();
  };

  const handleSelfieFallbackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError("Please upload a valid image (JPEG, PNG, WEBP).");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("File is too large. Maximum size is 5MB.");
        return;
      }
      setSelfieBlob(file);
      setSelfiePreview(URL.createObjectURL(file));
    }
  };

  const uploadSelfieAndMatch = async () => {
    if (!selfieBlob) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("selfie", selfieBlob, "selfie.jpg");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch(`${API_BASE}/api/verification/upload-selfie`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFaceMatchResult(json.data.faceMatchResult);
      } else {
        setError(json.error || "Failed to upload selfie.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep === 3 && !selfieBlob && !cameraDenied) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [currentStep, cameraDenied, selfieBlob]); // eslint-disable-line

  // --- Step 4 logic ---
  const submitVerification = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchApi<any>("/verification/submit", { method: "POST" });
    if (res.success && res.data) {
      setSubmittedAt(res.data.submittedAt);
      setCurrentStep(5);
    } else {
      setError(res.error || "Failed to submit verification.");
    }
    setLoading(false);
  };

  // --- Render helpers ---
  const steps = ["Details", "ID Upload", "Selfie", "Review", "Done"];

  return (
    <div className="min-h-[calc(100vh-80px)] py-12 px-4 bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-8 text-center">
          Identity Verification
        </h1>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-8 px-2 overflow-x-auto">
          {steps.map((label, idx) => {
            const stepNum = idx + 1;
            const isCompleted = currentStep > stepNum;
            const isCurrent = currentStep === stepNum;
            return (
              <div key={label} className="flex flex-col items-center flex-1 min-w-[80px]">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm z-10 mb-2 transition-colors ${
                    isCompleted
                      ? "bg-teal-500 text-white"
                      : isCurrent
                        ? "bg-teal-600 text-white ring-4 ring-teal-100"
                        : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    isCurrent ? "text-teal-700" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="glass-panel p-8 rounded-[2rem]">
          {/* Step 1: Prefill & Doc Type */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-2">
                Personal Details
              </h2>
              {loading && !prefill ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-slate-700 font-medium cursor-not-allowed"
                      value={prefill?.fullName || ""}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-slate-700 font-medium cursor-not-allowed"
                      value={prefill?.email || ""}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-slate-700 font-medium cursor-not-allowed"
                      value={prefill?.phone || "Not provided"}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl text-slate-700 font-medium cursor-not-allowed"
                      value={prefill?.dateOfBirth || "Not provided"}
                      readOnly
                    />
                  </div>
                </div>
              )}

              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-2 mt-8">
                Document Type
              </h2>
              <div className="flex gap-4">
                <label
                  className={`flex-1 flex flex-col items-center justify-center p-6 border-2 rounded-2xl cursor-pointer transition-all ${
                    documentType === "passport"
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="docType"
                    value="passport"
                    checked={documentType === "passport"}
                    onChange={() => setDocumentType("passport")}
                    className="hidden"
                  />
                  <FileImage className="h-8 w-8 mb-2" />
                  <span className="font-bold">Passport</span>
                </label>
                <label
                  className={`flex-1 flex flex-col items-center justify-center p-6 border-2 rounded-2xl cursor-pointer transition-all ${
                    documentType === "drivers_license"
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="docType"
                    value="drivers_license"
                    checked={documentType === "drivers_license"}
                    onChange={() => setDocumentType("drivers_license")}
                    className="hidden"
                  />
                  <FileImage className="h-8 w-8 mb-2" />
                  <span className="font-bold">Driver License</span>
                </label>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!documentType || loading}
                  className="px-6 py-3 bg-slate-900 text-white rounded-full font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next Step <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: ID Upload */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <h2 className="text-xl font-bold text-slate-800">
                Upload {documentType === "passport" ? "Passport" : "Driver License"}
              </h2>

              {!ocrResult ? (
                <>
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleIdDrop}
                    className="border-2 border-dashed border-slate-300 rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-teal-400 hover:bg-slate-50 transition-all bg-white relative overflow-hidden group"
                  >
                    <input
                      type="file"
                      accept="image/jpeg, image/png, image/webp"
                      className="hidden"
                      onChange={handleIdChange}
                    />
                    {idPreview ? (
                      <div className="absolute inset-0 z-0">
                        <img
                          src={idPreview}
                          alt="ID Preview"
                          className="w-full h-full object-contain opacity-40 group-hover:opacity-20 transition-opacity"
                        />
                      </div>
                    ) : (
                      <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 z-10">
                        <Upload className="h-8 w-8 text-slate-400" />
                      </div>
                    )}
                    <span className="text-slate-700 font-bold mb-1 z-10">
                      Click to browse or drag and drop
                    </span>
                    <span className="text-slate-500 text-sm z-10 break-all">
                      {idFile ? idFile.name : "JPEG, PNG, or WEBP up to 5MB"}
                    </span>
                  </label>

                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="px-6 py-3 text-slate-500 font-bold hover:text-slate-800"
                    >
                      Back
                    </button>
                    <button
                      onClick={uploadIdAndScan}
                      disabled={!idFile || loading}
                      className="px-8 py-3 bg-teal-600 text-white rounded-full font-bold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" /> Scanning...
                        </>
                      ) : (
                        "Upload and Scan"
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 text-teal-700 mb-4 pb-4 border-b border-slate-100">
                    <Check className="h-6 w-6 bg-teal-100 rounded-full p-1" />
                    <h3 className="font-bold text-lg">Scan Successful</h3>
                  </div>
                  <div className="space-y-3 mb-6">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase">Extracted Name</span>
                      <p className="font-medium text-slate-900">{ocrResult.extractedName || "Not found"}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase">Date of Birth</span>
                      <p className="font-medium text-slate-900">{ocrResult.extractedDOB || "Not found"}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase">Document Number</span>
                      <p className="font-medium text-slate-900">{ocrResult.documentNumber || "Not found"}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setOcrResult(null);
                        setIdFile(null);
                        setIdPreview(null);
                      }}
                      className="flex-1 py-3 px-4 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 transition-colors tracking-wide"
                    >
                      Re-upload
                    </button>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="flex-1 py-3 px-4 bg-slate-900 font-bold text-white rounded-xl hover:bg-slate-800 transition-colors shadow-md tracking-wide"
                    >
                      This looks correct
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Selfie Capture */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <h2 className="text-xl font-bold text-slate-800 text-center">
                Take a Selfie
              </h2>
              <p className="text-center text-slate-500 mb-4">
                We need to compare your face to your ID document.
              </p>

              {!faceMatchResult ? (
                <>
                  <div className="relative mx-auto w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden bg-slate-900 border-4 border-slate-100 shadow-xl">
                    {selfiePreview ? (
                      <img
                        src={selfiePreview}
                        alt="Selfie preview"
                        className="w-full h-full object-cover transform scale-x-[-1]"
                      />
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          className="w-full h-full object-cover transform scale-x-[-1]"
                          playsInline
                          muted
                        />
                        {cameraDenied && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-slate-800/90 text-white">
                            <Camera className="h-10 w-10 text-slate-400 mb-2" />
                            <p className="font-medium text-sm">Camera access denied.</p>
                            <label className="mt-4 px-4 py-2 bg-slate-700 text-white text-sm font-bold border border-slate-600 rounded-lg cursor-pointer hover:bg-slate-600">
                              Upload Photo Instead
                              <input
                                type="file"
                                accept="image/jpeg, image/png, image/webp"
                                className="hidden"
                                onChange={handleSelfieFallbackChange}
                              />
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="flex justify-center gap-4 mt-8">
                    {!selfiePreview ? (
                      <button
                        onClick={takePhoto}
                        disabled={cameraDenied || !cameraStream}
                        className="px-8 py-3 bg-teal-600 text-white rounded-full font-bold shadow-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Camera className="h-5 w-5" /> Take Photo
                      </button>
                    ) : (
                      <button
                        onClick={retakePhoto}
                        disabled={loading}
                        className="px-8 py-3 bg-slate-200 text-slate-800 rounded-full font-bold hover:bg-slate-300 disabled:opacity-50"
                      >
                        Retake
                      </button>
                    )}
                  </div>

                  <div className="flex justify-between pt-6 border-t border-slate-100 mt-6">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-6 py-3 text-slate-500 font-bold hover:text-slate-800"
                    >
                      Back
                    </button>
                    <button
                      onClick={uploadSelfieAndMatch}
                      disabled={!selfieBlob || loading}
                      className="px-8 py-3 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" /> Verifying...
                        </>
                      ) : (
                        "Verify Match"
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-center">
                  <div className="flex justify-center mb-4">
                    {faceMatchResult.matched ? (
                      <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                        <Check className="h-8 w-8" />
                      </div>
                    ) : (
                      <div className="h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                        <X className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-xl text-slate-900 mb-2">
                    {faceMatchResult.matched ? "Face Matched Successfully" : "Face Match Failed"}
                  </h3>
                  <p className="text-slate-500 mb-6">
                    Similarity Score: <span className="font-bold text-slate-700">{faceMatchResult.similarity !== undefined ? faceMatchResult.similarity.toFixed(1) : 0}%</span>
                  </p>
                  
                  <div className="flex gap-4 justify-center">
                    {!faceMatchResult.matched && (
                      <button
                        onClick={() => {
                          setFaceMatchResult(null);
                          retakePhoto();
                        }}
                        className="py-3 px-6 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50"
                      >
                        Try Again
                      </button>
                    )}
                    {faceMatchResult.matched && (
                      <button
                        onClick={() => setCurrentStep(4)}
                        className="py-3 px-8 bg-slate-900 font-bold text-white rounded-xl hover:bg-slate-800 shadow-md"
                      >
                        Continue
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review and Submit */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <h2 className="text-xl font-bold text-slate-800">
                Review & Submit
              </h2>
              
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <h4 className="font-bold text-slate-900">ID Document Scan</h4>
                    <p className="text-sm text-slate-500">Name and DOB extracted</p>
                  </div>
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <h4 className="font-bold text-slate-900">Face Match</h4>
                    <p className="text-sm text-slate-500">
                      {faceMatchResult?.similarity?.toFixed(1) || 0}% Similarity
                    </p>
                  </div>
                  {faceMatchResult?.matched ? (
                    <Check className="h-6 w-6 text-green-500" />
                  ) : (
                    <X className="h-6 w-6 text-red-500" />
                  )}
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-sm">
                  <p className="font-medium">What happens next?</p>
                  <p className="mt-1 opacity-90">
                    When you submit, we will run an automated background check (NSOPW) using your extracted details. Your application will then enter manual review.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-6">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-6 py-3 text-slate-500 font-bold hover:text-slate-800"
                >
                  Back
                </button>
                <button
                  onClick={submitVerification}
                  disabled={loading}
                  className="px-8 py-3 bg-teal-600 text-white rounded-full font-bold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-teal-600/20 transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Submitting...
                    </>
                  ) : (
                    "Submit for Verification"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Confirmation */}
          {currentStep === 5 && (
            <div className="text-center py-12 animate-in zoom-in-95 duration-500">
              <div className="h-20 w-20 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="h-10 w-10" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Verification Submitted
              </h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto text-lg">
                Your identity verification is currently under review. You will be notified once the process is complete.
              </p>
              
              {submittedAt && (
                <p className="text-sm text-slate-400 mb-8 font-medium">
                  Submitted: {new Date(submittedAt).toLocaleString()}
                </p>
              )}
              
              <button
                onClick={() => onNavigate(`/profile/me`)}
                className="px-8 py-4 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
              >
                Return to Profile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
