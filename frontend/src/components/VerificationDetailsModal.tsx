import React, { useState, useEffect } from "react";
import {
  X,
  FileCheck2,
  ScanFace,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import fetchApi from "../lib/api";

interface VerificationDetailsModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface VerificationData {
  verification_status: string;
  extracted_name?: string;
  extracted_dob?: string;
  ocr_result?: {
    status?: string;
    extractedName?: string;
    extractedDOB?: string;
    documentNumber?: string;
    expiryDate?: string;
    issuingState?: string;
    confidence?: number;
    rejectionReason?: string | null;
  };
  face_match_result?: {
    status?: string;
    similarity?: number;
    matched?: boolean;
    faceDetectedInId?: boolean;
    faceDetectedInSelfie?: boolean;
  };
  nsopw_result?: {
    nsopwStatus?: string;
    matchFound?: boolean;
    matchDetails?: unknown[];
  };
  submitted_at?: string;
  reviewed_at?: string;
  created_at?: string;
}

const STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  pending: "Under Review",
  manual_review: "Under Manual Review",
  rejected: "Not Verified",
  failed: "Not Verified",
  unverified: "Not Verified",
};

const overallBadgeClass = (status: string) => {
  if (status === "verified") return "bg-emerald-100 text-emerald-700";
  if (status === "pending" || status === "manual_review") return "bg-amber-100 text-amber-700";
  if (status === "failed" || status === "rejected") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
};

const StatusIcon: React.FC<{ status?: string }> = ({ status }) => {
  switch (status) {
    case "verified":
      return <CheckCircle2 size={18} className="text-emerald-500" />;
    case "rejected":
      return <XCircle size={18} className="text-red-500" />;
    case "manual_review":
    case "pending":
      return <Clock size={18} className="text-amber-500" />;
    default:
      return <AlertTriangle size={18} className="text-slate-400" />;
  }
};

export const VerificationDetailsModal: React.FC<
  VerificationDetailsModalProps
> = ({ userId, isOpen, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerificationData | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;

    let cancelled = false;

    const load = async () => {
      const resp = await fetchApi<VerificationData>(
        `/verification/status/${userId}`,
      );
      if (!cancelled) {
        setData(resp.data || null);
        setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const ocrResult = data?.ocr_result;
  const faceData = data?.face_match_result;
  const nsopwData = data?.nsopw_result;

  // Derive section-level status from actual result fields, not the AI's `status` string.
  // The AI may store status="rejected" even when fields were extracted (low confidence),
  // or status="verified" even when face match failed — so we check real data.
  const ocrStatus: string | undefined =
    ocrResult?.extractedName || ocrResult?.extractedDOB ? "verified" : ocrResult?.status;

  const faceStatus: string | undefined =
    faceData?.matched === true ? "verified" :
    faceData?.matched === false ? "rejected" :
    faceData?.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 pb-4 border-b border-slate-100 rounded-t-3xl z-10">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            Verification Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
              <p className="mt-3 text-slate-500 text-sm">
                Loading verification details...
              </p>
            </div>
          ) : !data ||
            data.verification_status === "unverified" ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">
                No verification on record
              </p>
              <p className="text-slate-400 text-sm mt-1">
                This user has not started the verification process.
              </p>
            </div>
          ) : (
            <>
              {/* Overall Status */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <span className="text-sm font-semibold text-slate-600">
                  Overall Status
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${overallBadgeClass(data.verification_status)}`}
                >
                  <StatusIcon status={data.verification_status} />
                  {STATUS_LABELS[data.verification_status] ??
                    data.verification_status}
                </span>
              </div>

              {/* OCR Result */}
              <div className="p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck2 size={16} className="text-teal-600" />
                  <span className="text-sm font-bold text-slate-700">
                    Document OCR
                  </span>
                  <StatusIcon status={ocrStatus} />
                </div>
                {ocrResult?.extractedName || ocrResult?.extractedDOB ? (
                  <div className="space-y-1.5 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">Name:</span>{" "}
                      {ocrResult.extractedName || "—"}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">DOB:</span>{" "}
                      {ocrResult.extractedDOB || "—"}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">
                        ID Number:
                      </span>{" "}
                      {ocrResult.documentNumber || "—"}
                    </p>
                    {ocrResult.confidence !== undefined && (
                      <p className="text-slate-400 text-xs mt-1">
                        Confidence:{" "}
                        {(ocrResult.confidence * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Not yet scanned</p>
                )}
              </div>

              {/* Face Match */}
              <div className="p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <ScanFace size={16} className="text-teal-600" />
                  <span className="text-sm font-bold text-slate-700">
                    Face Match
                  </span>
                  <StatusIcon status={faceStatus} />
                </div>
                {faceData ? (
                  <div className="space-y-1.5 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">
                        Similarity:
                      </span>{" "}
                      {faceData.similarity?.toFixed(1) ?? "—"}%
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">Match:</span>{" "}
                      {faceData.matched ? "✅ Yes" : "❌ No"}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Not yet checked</p>
                )}
              </div>

              {/* NSOPW */}
              <div className="p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={16} className="text-teal-600" />
                  <span className="text-sm font-bold text-slate-700">
                    Background Check (NSOPW)
                  </span>
                  <StatusIcon status={nsopwData?.nsopwStatus} />
                </div>
                {nsopwData ? (
                  <div className="space-y-1.5 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">
                        Status:
                      </span>{" "}
                      {nsopwData.matchFound === false ? "✅ Clear" : "⚠️ Review needed"}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Runs automatically on submission
                  </p>
                )}
              </div>

              {/* Dates */}
              {data.submitted_at && (
                <div className="text-xs text-slate-400 text-center pt-2">
                  Submitted:{" "}
                  {new Date(data.submitted_at).toLocaleString()}
                  {data.reviewed_at && (
                    <>
                      {" "}
                      · Reviewed:{" "}
                      {new Date(data.reviewed_at).toLocaleString()}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
