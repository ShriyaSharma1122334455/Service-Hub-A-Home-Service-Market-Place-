import { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import { VerificationBadge, type VerificationStatus } from './VerificationBadge';

interface VerificationDetailsModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const VerificationDetailsModal = ({ userId, isOpen, onClose }: VerificationDetailsModalProps) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;

    const fetchStatus = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('servicehub-auth') ? JSON.parse(localStorage.getItem('servicehub-auth')!).accessToken : '';
        const res = await fetch(`${API_BASE}/api/verification/status/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || 'Failed to fetch verification status');
        setData({
          status: result.verificationStatus || 'unverified',
          record: result.verificationRecord || null
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [isOpen, userId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <ShieldCheck className="w-6 h-6 text-teal-600" />
            Verification Report
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
              <p className="mt-4 text-slate-500 font-medium">Loading report...</p>
            </div>
          ) : error ? (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-xl flex items-start gap-3 border border-rose-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="font-semibold text-slate-700">Overall Status</span>
                <VerificationBadge status={data?.status as VerificationStatus} showText />
              </div>

              {data?.record && (
                <div className="space-y-4">
                  
                  {/* ID Document & OCR */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 text-sm">
                      ID Document (OCR)
                    </div>
                    <div className="p-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Document Type</span>
                        <span className="font-medium text-slate-900 capitalize">{data.record.documentType?.replace('_', ' ')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Extracted Name</span>
                        <span className="font-medium text-slate-900">{data.record.extractedName || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Document Data</span>
                        <span className="font-medium text-slate-900">
                          {data.record.ocrResult ? <CheckCircle className="w-4 h-4 text-emerald-500 inline" /> : 'Missing'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Face Match */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 text-sm">
                      Face Match
                    </div>
                    <div className="p-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Match Result</span>
                        <span className="font-medium text-slate-900 flex items-center gap-1">
                          {data.record.faceMatchResult?.matched ? (
                            <><CheckCircle className="w-4 h-4 text-emerald-500" /> Matched</>
                          ) : (
                            <><XCircle className="w-4 h-4 text-rose-500" /> Not Matched</>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Similarity Score</span>
                        <span className="font-medium text-slate-900">{data.record.faceMatchResult?.similarity || 0}%</span>
                      </div>
                    </div>
                  </div>

                  {/* NSOPW */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 text-sm">
                      National Background Check (NSOPW)
                    </div>
                    <div className="p-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Status</span>
                        <span className="font-medium text-slate-900 flex items-center gap-1 capitalize">
                          {data.record.nsopwResult?.nsopwStatus === 'pass' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                          {data.record.nsopwResult?.nsopwStatus === 'fail' && <XCircle className="w-4 h-4 text-rose-500" />}
                          {data.record.nsopwResult?.nsopwStatus === 'pending' && <Clock className="w-4 h-4 text-amber-500" />}
                          {data.record.nsopwResult?.nsopwStatus || 'Pending'}
                        </span>
                      </div>
                      {data.record.nsopwResult?.matchFound && (
                        <div className="bg-rose-50 text-rose-700 p-3 rounded-lg mt-2 text-xs">
                          Potential match found on national registry. Requires admin review.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-center text-slate-400 pt-2">
                    Submitted on: {new Date(data.record.submittedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
