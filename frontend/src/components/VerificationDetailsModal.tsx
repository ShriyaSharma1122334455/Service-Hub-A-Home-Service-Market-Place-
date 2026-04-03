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
    extracted_data?: {
      full_name?: string;
      date_of_birth?: string;
      id_number?: string;
      expiration_date?: string;
      issue_state?: string;
    };
    confidence_score?: number;
  };
  face_match_result?: {
    status?: string;
    similarity_score?: number;
    is_match?: boolean;
    threshold_used?: number;
  };
  nsopw_result?: {
    status?: string;
    is_clear?: boolean;
    used_fallback?: boolean;
  };
  submitted_at?: string;
  reviewed_at?: string;
  created_at?: string;
}

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
    setLoading(true);

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

  const ocrData = data?.ocr_result?.extracted_data;
  const faceData = data?.face_match_result;
  const nsopwData = data?.nsopw_result;

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
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold
                    ${data.verification_status === "verified" ? "bg-emerald-100 text-emerald-700" : ""}
                    ${data.verification_status === "pending" ? "bg-amber-100 text-amber-700" : ""}
                    ${data.verification_status === "failed" ? "bg-red-100 text-red-700" : ""}
                    ${data.verification_status === "unverified" ? "bg-slate-100 text-slate-600" : ""}`}
                >
                  <StatusIcon status={data.verification_status} />
                  {data.verification_status.charAt(0).toUpperCase() +
                    data.verification_status.slice(1)}
                </span>
              </div>

              {/* OCR Result */}
              <div className="p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck2 size={16} className="text-teal-600" />
                  <span className="text-sm font-bold text-slate-700">
                    Document OCR
                  </span>
                  <StatusIcon status={data.ocr_result?.status} />
                </div>
                {ocrData ? (
                  <div className="space-y-1.5 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">Name:</span>{" "}
                      {ocrData.full_name || "—"}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">DOB:</span>{" "}
                      {ocrData.date_of_birth || "—"}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">
                        ID Number:
                      </span>{" "}
                      {ocrData.id_number || "—"}
                    </p>
                    {data.ocr_result?.confidence_score !== undefined && (
                      <p className="text-slate-400 text-xs mt-1">
                        Confidence:{" "}
                        {(data.ocr_result.confidence_score * 100).toFixed(1)}%
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
                  <StatusIcon status={faceData?.status} />
                </div>
                {faceData ? (
                  <div className="space-y-1.5 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">
                        Similarity:
                      </span>{" "}
                      {faceData.similarity_score?.toFixed(1) ?? "—"}%
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">Match:</span>{" "}
                      {faceData.is_match ? "✅ Yes" : "❌ No"}
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
                  <StatusIcon status={nsopwData?.status} />
                </div>
                {nsopwData ? (
                  <div className="space-y-1.5 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-800">
                        Status:
                      </span>{" "}
                      {nsopwData.is_clear ? "✅ Clear" : "⚠️ Review needed"}
                    </p>
                    {nsopwData.used_fallback && (
                      <p className="text-amber-600 text-xs">
                        Used self-declaration fallback
                      </p>
                    )}
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
