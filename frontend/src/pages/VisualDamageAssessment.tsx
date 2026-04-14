import { useState } from "react";
import {
  Camera,
  Loader2,
  AlertCircle,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { postFormData } from "../lib/api";
import {
  saveDamagePrefill,
} from "../lib/damagePrefill";

interface VisualDamageAssessmentProps {
  onNavigate: (path: string) => void;
}

type VdaPayload = {
  vda: {
    assessment: string;
    recommendation: string;
    estimated_cost_usd: string;
    confidence_score: string;
  };
  recommended_services: Array<{
    id: string;
    name: string;
    description: string | null;
    base_price: number;
    duration_minutes: number;
    category: { slug: string; name: string } | null;
  }>;
  job_description: string;
};

export const VisualDamageAssessment = ({
  onNavigate,
}: VisualDamageAssessmentProps) => {
  const [task, setTask] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VdaPayload | null>(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setError(null);
    setResult(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (!f) {
      setFile(null);
      return;
    }
    if (!/^image\/(jpeg|png)$/i.test(f.type)) {
      setError("Please choose a JPEG or PNG image.");
      setFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Image must be 10MB or smaller.");
      setFile(null);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const runAssessment = async () => {
    if (!file) {
      setError("Select a photo first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("image", file);
    if (task.trim()) form.append("task", task.trim());

    const res = await postFormData<VdaPayload>("/assessments/visual", form);
    setLoading(false);

    if (!res.success) {
      const msg = res.error || "Assessment failed.";
      const lower = msg.toLowerCase();
      if (lower.includes("customers only") || msg.includes("403")) {
        setError(
          "Visual assessment is available to customer accounts only. Sign in with a customer profile.",
        );
      } else if (
        msg.includes("401") ||
        lower.includes("unauthorized") ||
        lower.includes("sign in")
      ) {
        setError("Please sign in to run a visual assessment.");
      } else {
        setError(msg);
      }
      return;
    }
    setResult(res.data);
  };

  const goBookService = (serviceId: string, jobDescription: string) => {
    saveDamagePrefill({
      job_description: jobDescription,
      service_id: serviceId,
    });
    onNavigate(`/book/${serviceId}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
      <div className="rounded-3xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-xl shadow-black/5 p-8 sm:p-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/25 mb-6">
          <Camera className="w-7 h-7" aria-hidden />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Visual damage assessment
        </h1>
        <p className="mt-3 text-slate-600 leading-relaxed">
          For customer accounts only. Upload a clear photo—we&apos;ll summarize
          what we see, suggest an indicative cost range, and suggest a few
          matching services. Each run is analyzed once and not saved on our
          servers.
        </p>

        <div
          className="mt-8 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950/90"
          role="note"
        >
          <strong className="font-semibold">Disclaimer:</strong> Estimates are
          educational only and not a firm quote. Actual pricing depends on an
          on-site inspection and provider rates.
        </div>

        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              Photo (JPEG or PNG, max 10MB)
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
              onChange={onPickFile}
            />
          </label>

          {previewUrl && (
            <div className="rounded-2xl overflow-hidden border border-slate-200 max-h-64 bg-slate-100">
              <img
                src={previewUrl}
                alt="Your upload preview"
                className="w-full h-full object-contain max-h-64"
              />
            </div>
          )}

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              What should we focus on? (optional)
            </span>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              placeholder="e.g. Is this water damage safe before I repaint?"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={runAssessment}
            disabled={loading || !file}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-lg shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                Analyzing…
              </>
            ) : (
              "Run assessment"
            )}
          </button>
        </div>

        {result && (
          <div className="mt-10 space-y-6 border-t border-slate-200/80 pt-10">
            <h2 className="text-lg font-bold text-slate-900">Summary</h2>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
              {result.vda.assessment}
            </p>

            <h3 className="text-base font-bold text-slate-900">
              Recommendation
            </h3>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
              {result.vda.recommendation}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Indicative cost (USD)
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {result.vda.estimated_cost_usd || "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Model confidence
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {result.vda.confidence_score || "—"}
                </p>
              </div>
            </div>

            {result.recommended_services[0] && (
              <div className="rounded-2xl border-2 border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-5 sm:p-6 shadow-sm shadow-teal-900/5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
                      <ClipboardList className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900">
                        Create a job
                      </h3>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                        Post a booking with the draft description below. We&apos;ll
                        take you to a short list of providers for{" "}
                        <span className="font-semibold text-slate-800">
                          {result.recommended_services[0].name}
                        </span>
                        —you pick who to request.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      goBookService(
                        result.recommended_services[0].id,
                        result.job_description,
                      )
                    }
                    className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white text-sm font-bold shadow-lg shadow-teal-600/25 hover:bg-teal-700 w-full sm:w-auto"
                  >
                    Create a job request
                    <ArrowRight className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {result.recommended_services.length > 1 && (
              <>
                <h3 className="text-base font-bold text-slate-900">
                  Other matching services
                </h3>
                <ul className="space-y-3">
                  {result.recommended_services.slice(1).map((svc) => (
                    <li
                      key={svc.id}
                      className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {svc.name}
                        </p>
                        {svc.category && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {svc.category.name}
                          </p>
                        )}
                        <p className="text-sm text-teal-700 font-medium mt-1">
                          From ${svc.base_price} · {svc.duration_minutes} min
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          goBookService(svc.id, result.job_description)
                        }
                        className="inline-flex items-center justify-center gap-1.5 shrink-0 px-4 py-2 rounded-xl bg-white text-teal-800 text-sm font-semibold border border-teal-200 hover:bg-teal-50"
                      >
                        Create job for this service
                        <ArrowRight className="w-4 h-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">
                Draft job description (for your booking)
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {result.job_description}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="mt-10 text-teal-700 font-semibold hover:text-teal-800 hover:underline"
        >
          ← Back to home
        </button>
      </div>
    </div>
  );
};
