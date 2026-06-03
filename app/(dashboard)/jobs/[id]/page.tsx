"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import JobMatchHubModal from "@/components/JobMatchHubModal";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import NextBestActionStrip from "@/components/enterprise/NextBestActionStrip";
import ContextualCopilotPanel from "@/components/enterprise/ContextualCopilotPanel";
import StatusBadge from "@/components/enterprise/StatusBadge";
import ApprovalPanel from "@/components/enterprise/ApprovalPanel";
import JobTeamPanel from "@/components/enterprise/JobTeamPanel";
import JobInterviewRoundsPanel from "@/components/JobInterviewRoundsPanel";
import DispositionReasonModal from "@/components/DispositionReasonModal";
import SocialShareModal from "@/components/jobs/SocialShareModal";
import { SingleMatchHistoryTable } from "@/components/SingleMatchHistoryTable";
import Toast from "@/components/Toast";
import { jobStatusRequiresDispositionReason } from "@/lib/dispositionRules";
import { REQUISITION_WORKFLOW_STEPS } from "@/lib/requisitionWorkflow";
import { UI } from "@/lib/ui";

type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  status: string;
  description?: string | null;
  created_at?: string | null;
  vendor_name?: string | null;
  open_positions?: number | null;
  employment_type?: string | null;
  experience_requirement?: string | null;
  pipeline_wip_limits?: Record<string, number> | null;
};
type JobQuestion = {
  id?: number;
  category: "technical" | "scenario" | "behavioral" | "hr";
  question: string;
  reference_answer?: string | null;
  sort_order?: number;
};

type JobStats = {
  total_applications: number;
  stage_counts: Record<string, number>;
  last_activity_at: string | null;
};

function AiCandidateHistorySummaryCard({ jobId, onReviewQuestions }: { jobId: number; onReviewQuestions: () => void }) {
  const { data, isLoading, mutate } = useSWR<{ runs: any[]; migration_required?: boolean }>(`/api/jobs/${jobId}/single-match-check/history`);
  const rows = data?.runs ?? [];

  if (isLoading) {
    return (
      <div className={`${UI.enterprise.elevatedCard} p-4`}>
        <div className="h-4 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className={`${UI.enterprise.elevatedCard} p-4`}>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        AI Match history
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Full 1-to-1 AI matching history for this job, including matched skills, gaps, and summary details.
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={onReviewQuestions}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Review AI interview questions
        </button>
      </div>
      <div className="mt-3">
        <SingleMatchHistoryTable
          runs={rows as any[]}
          loading={isLoading}
          migrationRequired={Boolean(data?.migration_required)}
          onRefreshRequested={async () => {
            await mutate();
          }}
          onRecomputeComplete={async () => {
            await mutate();
          }}
        />
      </div>
    </div>
  );
}

function JobPipelineStats({ jobId }: { jobId: number }) {
  const { data, isLoading } = useSWR<JobStats>(
    `/api/jobs/${jobId}/stats`
  );

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/80">
        <div className="h-4 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  const stages = [
    { key: "applied", label: "Applied", color: "text-blue-700 dark:text-blue-300" },
    { key: "screening", label: "Screening", color: "text-amber-700 dark:text-amber-300" },
    { key: "interview", label: "Interview", color: "text-sky-700 dark:text-sky-300" },
    { key: "selected", label: "Selected", color: "text-emerald-700 dark:text-emerald-300" },
    { key: "rejected", label: "Rejected", color: "text-red-700 dark:text-red-300" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/80">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Pipeline summary
        <span className="ml-2 text-xs font-normal text-slate-400">
          {data.total_applications} application{data.total_applications !== 1 ? "s" : ""}
        </span>
      </h3>
      <div className="mt-3 flex flex-wrap gap-3">
        {stages.map((s) => (
          <div key={s.key} className="min-w-[80px] rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-center dark:border-slate-700 dark:bg-slate-800/50">
            <div className={`text-lg font-bold ${s.color}`}>
              {data.stage_counts[s.key] ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>
      {data.last_activity_at && (
        <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Last activity: {new Date(data.last_activity_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" })}
        </div>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params?.id);
  const isValidId = useMemo(() => Number.isFinite(jobId), [jobId]);
  const [qBusy, setQBusy] = useState(false);
  const [matchHubOpen, setMatchHubOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [jobDisposition, setJobDisposition] = useState<{ nextStatus: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const [canManage, setCanManage] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetchJson<{
          user?: { role?: string };
          permissions?: Record<string, boolean>;
        }>("/api/auth/me");
        const role = (me.user?.role || "user").toLowerCase();
        if (!cancelled) {
          setCanManage(role === "admin" || me.permissions?.["jobs.manage"] !== false);
          setCanApprove(role === "admin" || me.permissions?.["approvals.manage"] === true);
        }
      } catch {
        /* leave defaults */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError && e.status === 403) {
      setToast({ message: `${e.message} — jobs.manage is required.`, variant: "error" });
    } else {
      setToast({ message: (e as Error)?.message || fallback, variant: "error" });
    }
  }

  const {
    data: job,
    error: jobError,
    isLoading: jobLoading,
    mutate: mutateJob,
  } = useSWR<Job>(isValidId ? `/api/jobs/${jobId}` : null);

  const {
    data: qPayload,
    isLoading: qLoading,
    mutate: mutateQuestions,
  } = useSWR<{ questions: JobQuestion[] }>(isValidId ? `/api/jobs/${jobId}/interview-questions` : null);

  const questions = qPayload?.questions ?? [];

  if (!isValidId) {
    return (
      <ModulePageFrame title="Job" subtitle="Invalid job id">
        <div className={`${UI.enterprise.elevatedCard} p-6`}>
          <Link href="/jobs" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
            Back to jobs
          </Link>
        </div>
      </ModulePageFrame>
    );
  }

  if (jobLoading) {
    return (
      <ModulePageFrame title="Job" subtitle="Loading…">
        <div className={`${UI.enterprise.elevatedCard} p-6`}>
          <div className="h-8 w-56 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-4 h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      </ModulePageFrame>
    );
  }

  if (jobError || !job) {
    return (
      <ModulePageFrame title="Unable to load job" subtitle={(jobError as Error)?.message || "Unknown error"}>
        <div className={`${UI.enterprise.elevatedCard} p-6`}>
          <Link href="/jobs" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
            Back to jobs
          </Link>
        </div>
      </ModulePageFrame>
    );
  }

  return (
    <>
      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
          autoHideMs={toast.variant === "success" ? 1200 : 3500}
        />
      ) : null}
      <SocialShareModal
        open={shareOpen}
        job={job}
        onClose={() => setShareOpen(false)}
        onToast={(message, variant = "success") => setToast({ message, variant })}
      />
      <DispositionReasonModal
        open={jobDisposition !== null}
        reasonSet="job_close"
        title="Job status change"
        description={`Select why this job is moving to “${jobDisposition?.nextStatus ?? ""}”.`}
        confirmLabel="Update status"
        onClose={() => setJobDisposition(null)}
        onConfirm={async (reasonId) => {
          if (!jobDisposition) return;
          try {
            await apiFetchJson(`/api/jobs/${jobId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: jobDisposition.nextStatus,
                disposition_reason_id: reasonId,
              }),
            });
            setJobDisposition(null);
            void mutateJob();
            setToast({ message: `Status updated to "${jobDisposition.nextStatus}".`, variant: "success" });
          } catch (e) {
            handleApiError(e, "Status update failed");
          }
        }}
      />
    <ModulePageFrame
      title={job.title}
      subtitle={[job.company, job.location].filter(Boolean).join(" · ")}
      metrics={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status || "Open"} />
          {String(job.status || "").toLowerCase().includes("open") && Number(job.open_positions || 0) > 0 ? (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-950/60"
            >
              Post in social media
            </button>
          ) : null}
          {canManage ? (
            <select
              value={job.status || "Open"}
              onChange={async (e) => {
                const v = e.target.value;
                if (jobStatusRequiresDispositionReason(v)) {
                  setJobDisposition({ nextStatus: v });
                  return;
                }
                try {
                  await apiFetchJson(`/api/jobs/${jobId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: v }),
                  });
                  void mutateJob();
                  setToast({ message: `Status updated to "${v}".`, variant: "success" });
                } catch (e) {
                  handleApiError(e, "Status update failed");
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
            >
              {REQUISITION_WORKFLOW_STEPS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : null}
        </span>
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className={UI.secondaryButton + " py-2 text-sm"}
          >
            Post in social media
          </button>
          <button
            type="button"
            onClick={() => setMatchHubOpen(true)}
            className={UI.primaryButton + " py-2 text-sm"}
          >
            JD &amp; resume matches
          </button>
          <Link href="/jobs" className={UI.secondaryButton + " py-2 text-sm"}>
            Back to jobs
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <NextBestActionStrip
          title="Next best actions"
          actions={[
            { label: "Review AI match history", href: "#ai-match-history" },
            { label: "Open pipeline for this job", href: `/pipeline?job_id=${jobId}` },
            { label: "Open interviews desk", href: "/interviews" },
          ]}
        />
        <div className={`${UI.enterprise.elevatedCard} p-6`}>
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Company</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{job.company}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Location</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{job.location}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Client</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{job.vendor_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Open positions</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{job.open_positions ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Employment type</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{job.employment_type || "—"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Experience (careers)</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                {job.experience_requirement?.trim() || "—"}
              </dd>
            </div>
          </dl>
          <div className="mt-6">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
              {job.description?.trim() || "No description provided."}
            </p>
          </div>
        </div>

        <ApprovalPanel
          jobId={jobId}
          jobStatus={job.status || ""}
          canManage={canManage}
          canApprove={canApprove}
          onStatusChange={() => void mutateJob()}
          onToast={(msg, v) => setToast({ message: msg, variant: v })}
        />

        <JobPipelineStats jobId={jobId} />

        <div id="ai-match-history">
          <AiCandidateHistorySummaryCard
            jobId={jobId}
            onReviewQuestions={() => {
              if (typeof document === "undefined") return;
              document.getElementById("ai-interview-questions")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>

        <ContextualCopilotPanel scope="job" entityId={jobId} subtitle={`${job.title} · ${job.company}`} />

        <JobTeamPanel
          jobId={jobId}
          canManage={canManage}
          onToast={(msg, v) => setToast({ message: msg, variant: v })}
        />

        <JobInterviewRoundsPanel
          jobId={jobId}
          canManage={canManage}
          pipelineWipLimits={job.pipeline_wip_limits ?? null}
          onSavedWip={() => void mutateJob()}
          onToast={(msg, v) => setToast({ message: msg, variant: v })}
        />

        <div id="ai-interview-questions" className={`${UI.enterprise.elevatedCard} p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI interview questions</div>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setQBusy(true);
                try {
                  const res = await apiFetchJson<{ questions: JobQuestion[] }>(`/api/jobs/${jobId}/interview-questions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  void mutateQuestions(res, { revalidate: false });
                  setToast({ message: "Interview questions generated.", variant: "success" });
                } catch (e) {
                  handleApiError(e, "Failed to generate interview questions");
                } finally {
                  setQBusy(false);
                }
              }}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500"
              disabled={qBusy}
            >
              {qBusy ? "Generating AI questions..." : "Generate AI questions"}
            </button>
            <button
              type="button"
              onClick={() => setMatchHubOpen(true)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Review AI match context
            </button>
            </div>
          </div>
          {qLoading ? <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">Loading questions…</div> : null}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(["technical", "scenario", "behavioral", "hr"] as const).map((cat) => (
              <div key={cat} className="rounded-lg border border-slate-200 p-3 dark:border-slate-600">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{cat}</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700 dark:text-slate-300">
                  {questions.filter((q) => q.category === cat).map((q, idx) => (
                    <li key={`${cat}-${idx}`} className="space-y-1">
                      <div>{q.question}</div>
                      {q.reference_answer?.trim() ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <span className="font-semibold">Reference answer: </span>
                          <span className="whitespace-pre-wrap">{q.reference_answer}</span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                  {questions.filter((q) => q.category === cat).length === 0 ? (
                    <li className="list-none text-xs text-slate-500 dark:text-slate-400">No AI questions yet.</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      <JobMatchHubModal job={job} open={matchHubOpen} onClose={() => setMatchHubOpen(false)} />
    </ModulePageFrame>
    </>
  );
}
