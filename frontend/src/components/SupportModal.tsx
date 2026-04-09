import React, { useState } from "react";
import { X, MessageSquare, Loader2 } from "lucide-react";
import fetchApi from "../lib/api";

type UserRole = "customer" | "provider";
type Priority = "LOW" | "MEDIUM" | "HIGH";

const CUSTOMER_SUBJECTS = [
  "Provider did not show up",
  "Poor quality of work",
  "Billing or payment issue",
  "Rude or unprofessional behavior",
  "Safety concern",
  "Other",
];

const PROVIDER_SUBJECTS = [
  "Billing or payment issue",
  "Rude or unprofessional behavior",
  "Verification or profile appeal",
  "Incorrect service category",
  "Safety concern",
  "Other",
];

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userRole: UserRole;
}

export const SupportModal: React.FC<SupportModalProps> = ({
  isOpen,
  onClose,
  userId,
  userRole,
}) => {
  const subjectOptions = userRole === "provider" ? PROVIDER_SUBJECTS : CUSTOMER_SUBJECTS;
  const [subject, setSubject] = useState(subjectOptions[0]);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setSubject(subjectOptions[0]);
    setDescription("");
    setPriority("MEDIUM");
    setError(null);
    setSubmitted(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await fetchApi("/complaints", {
        method: "POST",
        body: JSON.stringify({
          userId,
          subject,
          description,
          priority,
        }),
      });

      if (!result.success) {
        setError(result.error || "Failed to submit. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const priorityOptions: { value: Priority; label: string; color: string }[] = [
    {
      value: "LOW",
      label: "Low",
      color: "text-slate-600 border-slate-300 bg-slate-50",
    },
    {
      value: "MEDIUM",
      label: "Medium",
      color: "text-amber-700 border-amber-300 bg-amber-50",
    },
    {
      value: "HIGH",
      label: "High",
      color: "text-red-700 border-red-300 bg-red-50",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="relative bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-teal-50 border border-teal-100">
                <MessageSquare size={20} className="text-teal-600" />
              </div>
              <div>
                <h3
                  id="support-modal-title"
                  className="text-lg font-bold text-slate-900"
                >
                  {userRole === "provider"
                    ? "Provider Support"
                    : "Customer Support"}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  We'll get back to you within 24 hours
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Success state */}
          {submitted ? (
            <div className="px-6 py-12 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h4 className="text-xl font-bold text-slate-900 mb-2">
                Ticket Submitted!
              </h4>
              <p className="text-slate-500 font-medium mb-6">
                Our support team will review your request and respond shortly.
              </p>
              <button
                onClick={handleClose}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-full font-bold text-sm hover:bg-slate-800 transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {/* Subject */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  What is your issue about?
                </label>
                <select
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition"
                >
                  {subjectOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Priority
                </label>
                <div className="flex gap-2">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriority(opt.value)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all ${
                        priority === opt.value
                          ? opt.color + " shadow-sm scale-[1.02]"
                          : "border-slate-200 text-slate-400 bg-white hover:border-slate-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please describe your issue in detail..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition resize-none"
                />
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-red-600 font-medium bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1 pb-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl text-sm font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Ticket"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
