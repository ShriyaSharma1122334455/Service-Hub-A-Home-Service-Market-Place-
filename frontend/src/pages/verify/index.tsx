import { useState, useEffect, useRef } from 'react';
import type { User } from '../../../types';
import {
  CheckCircle,
  AlertCircle,
  UploadCloud,
  Camera,
  FileText,
  ShieldCheck,
  Loader2,
  ChevronRight
} from 'lucide-react';

interface VerifyProps {
  user: User | null;
  onNavigate: (path: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const Verify = ({ user, onNavigate }: VerifyProps) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill Data
  const [prefilled, setPrefilled] = useState<any>(null);
  const [originalData, setOriginalData] = useState<any>(null);
  const [documentType, setDocumentType] = useState('passport');

  // ID Upload
  const [idFile, setIdFile] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<any>(null);

  // Selfie
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [faceMatchResult, setFaceMatchResult] = useState<any>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  // Fetch prefill on mount
  useEffect(() => {
    if (!user) {
      onNavigate('/login');
      return;
    }
    const fetchPrefill = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('servicehub-auth') ? JSON.parse(localStorage.getItem('servicehub-auth')!).accessToken : '';
        const res = await fetch(`${API_BASE}/api/verification/prefill/${user!.id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to fetch user data');
        setPrefilled(data.user);
        setOriginalData(data.user);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPrefill();
  }, [user]);

  // Clean up camera stream
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [stream]);

  const handleIdUpload = async () => {
    if (!idFile) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('servicehub-auth') ? JSON.parse(localStorage.getItem('servicehub-auth')!).accessToken : '';
      const formData = new FormData();
      formData.append('document', idFile);
      formData.append('userId', user!.id);
      formData.append('documentType', documentType);

      const res = await fetch(`${API_BASE}/api/verification/upload-id`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to upload document');

      setOcrResult(data.ocrResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIdSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Validate
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG or WEBP allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large. Max 5MB allowed.');
      return;
    }
    setIdFile(file);
  };

  const startCamera = async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(mediaStream);
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setHasCameraPermission(false);
      setError('Camera permission denied or camera not available. Please enable camera access in your browser settings.');
    }
  };

  const captureSelfie = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        // Draw video frame to canvas
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        canvasRef.current.toBlob((blob) => {
          if (blob) {
            setSelfieBlob(blob);
            setSelfiePreview(URL.createObjectURL(blob));
            // Stop stream
            if (stream) stream.getTracks().forEach(t => t.stop());
            setStream(null);
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const handleSelfieUpload = async () => {
    if (!selfieBlob) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('servicehub-auth') ? JSON.parse(localStorage.getItem('servicehub-auth')!).accessToken : '';
      const formData = new FormData();
      formData.append('selfie', selfieBlob, 'selfie.jpg');
      formData.append('userId', user!.id);

      const res = await fetch(`${API_BASE}/api/verification/upload-selfie`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to verify selfie');

      setFaceMatchResult(data.faceMatchResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('servicehub-auth') ? JSON.parse(localStorage.getItem('servicehub-auth')!).accessToken : '';
      const res = await fetch(`${API_BASE}/api/verification/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: user!.id })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to submit verification request');

      setStep(5);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Prefill helpers
  const isEditable = (field: string) => !originalData?.[field];
  const handlePrefillChange = (field: string, value: string) => {
    setPrefilled((prev: any) => ({ ...prev, [field]: value }));
  };
  const getPrefillClassName = (field: string) =>
    `mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-sm text-slate-700 shadow-sm transition-colors ${!isEditable(field) ? 'opacity-80 cursor-not-allowed bg-slate-50' : 'focus:border-teal-500 focus:ring-teal-500 outline-none'
    }`;

  // UI Renderers
  const ProgressBar = () => {
    const steps = ['Info', 'ID Upload', 'Selfie', 'Review', 'Finish'];
    return (
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-200 -z-10 -translate-y-1/2 rounded-full" />
        {steps.map((s, idx) => {
          const num = idx + 1;
          const isActive = step === num;
          const isDone = step > num;
          return (
            <div key={num} className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${isActive ? 'bg-teal-600 border-teal-600 text-white' :
                isDone ? 'bg-teal-600 border-teal-600 text-white' :
                  'bg-white border-slate-300 text-slate-400'
                }`}>
                {isDone ? <CheckCircle size={16} /> : num}
              </div>
              <span className={`text-xs mt-2 font-medium hidden sm:block ${isActive || isDone ? 'text-teal-700' : 'text-slate-400'}`}>
                {s}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-10">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Identity Verification</h1>
          <p className="mt-2 text-slate-500">Fast and secure background check to build trust.</p>
        </div>

        <ProgressBar />

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* Step 1: Prefill Info */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-teal-600" />
                Review Your Information
              </h3>

              {loading && !prefilled ? (
                <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-teal-600 animate-spin" /></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name</label>
                    <input
                      readOnly={!isEditable('fullName')}
                      onChange={(e) => handlePrefillChange('fullName', e.target.value)}
                      value={prefilled?.fullName || ''}
                      placeholder={!isEditable('fullName') ? '' : 'Enter full name'}
                      className={getPrefillClassName('fullName')}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                    <input
                      readOnly={!isEditable('email')}
                      onChange={(e) => handlePrefillChange('email', e.target.value)}
                      value={prefilled?.email || ''}
                      placeholder={!isEditable('email') ? '' : 'Enter email'}
                      className={getPrefillClassName('email')}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</label>
                    <input
                      readOnly={!isEditable('phone')}
                      onChange={(e) => handlePrefillChange('phone', e.target.value)}
                      value={prefilled?.phone || ''}
                      placeholder={!isEditable('phone') ? 'Not provided' : 'Enter phone number'}
                      className={getPrefillClassName('phone')}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date of Birth</label>
                    <input
                      type={!isEditable('dateOfBirth') ? 'text' : 'date'}
                      readOnly={!isEditable('dateOfBirth')}
                      onChange={(e) => handlePrefillChange('dateOfBirth', e.target.value)}
                      value={prefilled?.dateOfBirth || ''}
                      placeholder={!isEditable('dateOfBirth') ? 'Not provided' : ''}
                      className={getPrefillClassName('dateOfBirth')}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Select ID Type for Upload</label>
              <select value={documentType} onChange={e => setDocumentType(e.target.value)} className="block w-full rounded-lg border-slate-300 px-4 py-3 bg-white shadow-sm focus:border-teal-500 focus:ring-teal-500">
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
              </select>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setStep(2)}
                disabled={loading || !prefilled}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-lg outline-none transition-all flex items-center shadow-md shadow-teal-500/30 disabled:opacity-50"
              >
                Next Step <ChevronRight className="w-5 h-5 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Upload ID */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {!ocrResult ? (
              <>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:bg-slate-50 hover:border-teal-400 transition-colors cursor-pointer relative">
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleIdSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <UploadCloud className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <h4 className="text-lg font-medium text-slate-800">
                    {idFile ? idFile.name : `Upload your ${documentType.replace('_', ' ')}`}
                  </h4>
                  <p className="text-sm text-slate-500 mt-2">Drag and drop or click to browse. Max 5MB (JPEG/PNG/WEBP)</p>
                </div>
                <div className="flex justify-between pt-4">
                  <button onClick={() => setStep(1)} className="text-slate-600 hover:text-slate-900 font-medium px-4 py-2">Back</button>
                  <button
                    onClick={handleIdUpload}
                    disabled={!idFile || loading}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-lg outline-none transition-all flex items-center shadow-md shadow-teal-500/30 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : 'Upload & Scan'}
                    {!loading && <ChevronRight className="w-5 h-5 ml-1" />}
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-white border text-center border-slate-200 rounded-xl p-6 shadow-sm">
                <ShieldCheck className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-800 mb-2">ID Scanned Successfully</h3>

                <div className="bg-slate-50 rounded-lg p-4 text-left my-6 space-y-3 border border-slate-200">
                  <div><span className="text-slate-500 text-sm font-medium block">Extracted Name</span><span className="font-semibold text-slate-800">{ocrResult.raw_text?.substring(0, 50) || 'Unknown'}</span></div>
                  <div><span className="text-slate-500 text-sm font-medium block">Document Type</span><span className="font-semibold text-slate-800 capitalize">{documentType.replace('_', ' ')}</span></div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button onClick={() => { setOcrResult(null); setIdFile(null); }} className="px-6 py-3 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors">
                    Re-upload ID
                  </button>
                  <button onClick={() => setStep(3)} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all">
                    This looks correct &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Selfie */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">

            {!selfieBlob && !faceMatchResult && (
              <>
                <div className="w-64 h-64 mx-auto rounded-full overflow-hidden border-4 border-slate-200 bg-slate-900 relative">
                  {!stream && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                      <Camera className="w-12 h-12 mb-2" />
                      <span className="text-sm font-medium px-4">Take a clear, well-lit selfie</span>
                    </div>
                  )}
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="pt-6">
                  {!stream ? (
                    <button onClick={startCamera} className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all">
                      Open Camera
                    </button>
                  ) : (
                    <button onClick={captureSelfie} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all">
                      Take Photo
                    </button>
                  )}
                </div>
              </>
            )}

            {selfiePreview && !faceMatchResult && (
              <>
                <div className="w-64 h-64 mx-auto rounded-full overflow-hidden border-4 border-teal-500 bg-slate-900">
                  <img src={selfiePreview} alt="Selfie preview" className="w-full h-full object-cover transform -scale-x-100" />
                </div>

                <div className="flex justify-center gap-4 pt-6">
                  <button onClick={() => { setSelfiePreview(null); setSelfieBlob(null); startCamera(); }} className="px-6 py-3 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors">
                    Retake
                  </button>
                  <button onClick={handleSelfieUpload} disabled={loading} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-lg shadow-md flex items-center transition-all disabled:opacity-50">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : 'Confirm & Match'}
                  </button>
                </div>
              </>
            )}

            {faceMatchResult && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
                {faceMatchResult.matched ? (
                  <CheckCircle className="w-16 h-16 text-teal-600 mx-auto mb-4" />
                ) : (
                  <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
                )}
                <h3 className="text-2xl font-bold text-slate-800 mb-2">
                  {faceMatchResult.matched ? 'Face Matched!' : 'Match Failed'}
                </h3>
                <p className="text-slate-600 font-medium text-lg border-b pb-4 mb-4">
                  Similarity Score: <span className="text-slate-900 font-bold">{faceMatchResult.similarity}%</span>
                </p>

                {faceMatchResult.matched ? (
                  <button onClick={() => setStep(4)} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 w-full rounded-lg shadow-md transition-all">
                    Continue to Review &rarr;
                  </button>
                ) : (
                  <div className="flex gap-4">
                    <button onClick={() => { setFaceMatchResult(null); setSelfieBlob(null); setSelfiePreview(null); startCamera(); }} className="px-6 py-3 w-full border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50">
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {!faceMatchResult && (
              <div className="flex justify-start">
                <button onClick={() => setStep(2)} className="text-slate-500 hover:text-slate-800 text-sm font-medium mt-[-20px]">Back</button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Submission */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-bold text-slate-800 mb-4 text-center">Verification Summary</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-teal-600 shrink-0" />
                <div>
                  <h4 className="font-semibold text-slate-800">ID Document</h4>
                  <p className="text-sm text-slate-500 mt-1">Successfully scanned {documentType.replace('_', ' ')}.</p>
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-teal-600 shrink-0" />
                <div>
                  <h4 className="font-semibold text-slate-800">Face Match</h4>
                  <p className="text-sm text-slate-500 mt-1">Selfie matched ID photo ({faceMatchResult?.similarity}% similarity).</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 mt-6">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h4 className="font-semibold text-amber-900">Background Check Notice</h4>
                <p className="text-sm text-amber-700 mt-1">Your identity will be checked against the National Sex Offender Public Website (NSOPW) upon submission.</p>
              </div>
            </div>

            <div className="flex justify-between pt-6">
              <button disabled={loading} onClick={() => setStep(3)} className="text-slate-600 hover:text-slate-900 font-medium px-4 py-2">Back to Selfie</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-slate-900 hover:bg-black text-white font-bold py-4 px-8 rounded-lg outline-none transition-all flex items-center shadow-lg hover:shadow-xl disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-4" /> : 'Submit for Verification'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && (
          <div className="text-center py-8 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-teal-600" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Verification Under Review</h2>
            <p className="text-slate-500 mb-2">We have securely received your documents.</p>
            <p className="text-sm font-medium text-slate-400 mb-8">Submitted on: {new Date().toLocaleString()}</p>

            <button
              onClick={() => onNavigate(`/profile/${user!.id}`)}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors"
            >
              Return to Profile
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
