"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, Loader2, RefreshCw, UserRound } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";
import Toast from "@/components/Toast";

const PIPELINE_STAGES = [
  "Applied",
  "Screening",
  "Screening Failed",
  "Interview",
  "Selected",
  "Rejected",
] as const;

type Candidate = {
  id: number;
  full_name: string;
  email?: string | null;
};

type Job = {
  id: number;
  title: string;
  company?: string | null;
  location?: string | null;
};

export default function AssignApplicationForm({
  onAssigned,
  /** When true, omit outer title block (parent supplies context). */
  embedded = false,
}: {
  onAssigned: () => void;
  embedded?: boolean;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidateId, setCandidateId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [stage, setStage] = useState<string>("Applied");
  /** "" = default to you (server); "__unassigned__" = null; else user id */
  const [ownerChoice, setOwnerChoice] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [recruiters, setRecruiters] = useState<Array<{ id: number; full_name: string }>>([]);

  const canSubmit = useMemo(() => candidateId.length > 0 && jobId.length > 0, [candidateId, jobId]);

  async function loadOptions() {
    setLoading(true);
    setToast(null);
    try {
      const [cData, jData] = await Promise.all([
        apiFetchJson<Candidate[]>("/api/candidates"),
        apiFetchJson<Job[]>("/api/jobs"),
      ]);
      setCandidates(cData);
      setJobs(jData);
      try {
        const rData = await apiFetchJson<Array<{ id: number; full_name: string }>>("/api/pipeline/recruiters");
        setRecruiters(Array.isArray(rData) ? rData : []);
      } catch {
        setRecruiters([]);
      }
    } catch (err: any) {
      setToast({ message: err.message || "Something went wrong", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "jobs_updated") {
        loadOptions();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setToast(null);
    try {
      const payload: Record<string, unknown> = {
        candidate_id: Number(candidateId),
        job_id: Number(jobId),
      };
      if (stage && stage !== "Applied") {
        payload.stage = stage;
      }
      if (ownerChoice === "__unassigned__") {
        payload.assigned_recruiter_user_id = null;
      } else if (ownerChoice) {
        payload.assigned_recruiter_user_id = Number(ownerChoice);
      }

      await apiFetchJson("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setToast({
        message:
          stage === "Applied" ? "Application created (Applied)." : `Application created in ${stage} stage.`,
        variant: "success",
      });
      setCandidateId("");
      setJobId("");
      setStage("Applied");
      setOwnerChoice("");
      onAssigned();
    } catch (err: any) {
      setToast({ message: err.message || "Something went wrong", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
      <form onSubmit={handleAssign} className="space-y-5">
        {!embedded ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Assign candidate to job</h2>
              <p className="mt-1 text-sm text-slate-600">Creates a pipeline application starting in the Applied stage.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadOptions()}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              disabled={loading || submitting}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh lists
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void loadOptions()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
              disabled={loading || submitting}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh lists
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Briefcase className="h-4 w-4" aria-hidden />
              </span>
              Initial stage
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              disabled={loading || submitting}
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Normal adds use <strong>Applied</strong>. Pick another stage only for imports, reopening, or data corrections.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <UserRound className="h-4 w-4" aria-hidden />
              </span>
              Owner (accountable recruiter)
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50"
              value={ownerChoice}
              onChange={(e) => setOwnerChoice(e.target.value)}
              disabled={loading || submitting}
            >
              <option value="">Me (default)</option>
              <option value="__unassigned__">Unassigned</option>
              {recruiters.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <UserRound className="h-4 w-4" aria-hidden />
              </span>
              Candidate
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              disabled={loading || submitting}
            >
              <option value="">Select candidate…</option>
              {candidates.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.full_name}
                  {c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Briefcase className="h-4 w-4" aria-hidden />
              </span>
              Job opening
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              disabled={loading || submitting}
            >
              <option value="">Select job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.title}
                  {j.company ? ` — ${j.company}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <button
            type="submit"
            disabled={!canSubmit || loading || submitting}
            className="inline-flex min-h-[44px] min-w-[140px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:pointer-events-none disabled:opacity-45"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {submitting ? "Assigning…" : "Assign to pipeline"}
          </button>
          <p className="text-xs text-slate-500">Requires pipeline manage permission. Duplicates may be blocked by the server.</p>
        </div>
      </form>
    </div>
  );
}
