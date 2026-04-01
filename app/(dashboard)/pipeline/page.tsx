"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronUp, SlidersHorizontal, UserPlus } from "lucide-react";
import AssignApplicationForm from "@/components/AssignApplicationForm";
import PipelineBoard from "@/components/PipelineBoard";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import DensityToggle from "@/components/ui/DensityToggle";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import FilterDrawer from "@/components/enterprise/FilterDrawer";

type Stage = "Applied" | "Screening" | "Screening Failed" | "Interview" | "Selected" | "Rejected";
const STAGES: Stage[] = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"];

type Job = {
  id: number;
  title: string;
  company?: string | null;
};

type ApplicationRow = {
  id: number;
  candidate_id: number;
  job_id: number;
  stage: Stage;
  updated_at: string;
  candidate_full_name: string;
  candidate_email?: string | null;
  candidate_phone?: string | null;
  job_title: string;
  job_company?: string | null;
  job_location?: string | null;
  interview_datetime?: string | null;
  assigned_recruiter_user_id?: number | null;
  assigned_recruiter_name?: string | null;
  current_interview_round_order?: number | null;
  current_interview_round_label?: string | null;
  interview_round_total?: number | null;
  interview_round_status?: string | null;
  rejected_in_round_order?: number | null;
  selected_after_rounds?: number | null;
};

type RecruiterOption = { id: number; full_name: string; email?: string | null };

export default function PipelinePage() {
  const { density, setDensity } = useDensity("ats:pipeline-density", "compact");
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(true);

  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  /** "" = all owners, "me" = my queue (assigned_recruiter = current user) */
  const [assignedTo, setAssignedTo] = useState<string>("");

  const [debouncedQ, setDebouncedQ] = useState(q);
  const [assignOpen, setAssignOpen] = useState(true);
  const [filterDrawer, setFilterDrawer] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const applicationsKey = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ.trim().length > 0) params.set("q", debouncedQ.trim());
    if (stage) params.set("stage", stage);
    if (jobId) params.set("job_id", jobId);
    if (assignedTo === "me") params.set("assigned_to", "me");
    const qs = params.toString();
    return `/api/applications${qs ? `?${qs}` : ""}`;
  }, [debouncedQ, stage, jobId, assignedTo]);

  const {
    data: applications = [],
    error: swrError,
    isLoading,
    mutate: mutateApplications,
  } = useSWR<ApplicationRow[]>(applicationsKey, dashboardFetcher, {
    refreshInterval: 60_000,
    onError: (err) => setError((err as Error)?.message || "Something went wrong"),
    onSuccess: () => setError(null),
  });

  const { data: jobs = [], mutate: mutateJobs } = useSWR<Job[]>("/api/jobs", dashboardFetcher, {
    refreshInterval: 60_000,
  });

  const { data: meData } = useSWR<{ user?: { id?: number } }>("/api/auth/me", dashboardFetcher, {
    refreshInterval: 120_000,
  });
  const currentUserId = meData?.user?.id;

  const { data: recruiters = [] } = useSWR<RecruiterOption[]>(
    canManage ? "/api/pipeline/recruiters" : null,
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );

  const loading = isLoading && applications.length === 0;

  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      try {
        const me = await apiFetchJson<{ user?: { role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me");
        const role = (me.user?.role || "user").toLowerCase();
        const manageAllowed = role === "admin" || me.permissions?.["pipeline.manage"] !== false;
        if (!cancelled) setCanManage(manageAllowed);
      } catch {
        if (!cancelled) setCanManage(false);
      }
    }
    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleStageUpdated(updated: ApplicationRow) {
    void mutateApplications(
      (prev) => (prev ?? []).map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
      { revalidate: false }
    );
  }

  const stageCounts = STAGES.reduce<Record<Stage, number>>(
    (acc, s) => {
      acc[s] = applications.filter((a) => a.stage === s).length;
      return acc;
    },
    { Applied: 0, Screening: 0, "Screening Failed": 0, Interview: 0, Selected: 0, Rejected: 0 }
  );

  return (
    <AccessGate permissionKey="pipeline.view">
      <FilterDrawer
        open={filterDrawer}
        onClose={() => setFilterDrawer(false)}
        title="Pipeline filters"
        onApply={() => setFilterDrawer(false)}
        onReset={() => {
          setQ("");
          setStage("");
          setJobId("");
          setAssignedTo("");
          setFilterDrawer(false);
        }}
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Search candidate</label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              placeholder="Name contains…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Updates the board after a short pause.</p>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Job</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              <option value="">All jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.title}
                  {j.company ? ` — ${j.company}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Stage</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="">All stages (board shows all columns)</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Restricts which applications load; columns stay the same.</p>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Owner (recruiter)</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">All owners</option>
              <option value="me">My queue only</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Filter by <strong className="font-semibold text-slate-700">assigned recruiter</strong> (accountable owner on the card). Requires{" "}
              <code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-700">pipeline.manage</code> to change owners on cards.
            </p>
          </div>
        </div>
      </FilterDrawer>

      <ModulePageFrame
        title="Pipeline"
        subtitle="Add applications, then drag across stages or use card actions for interviews and stage moves."
        metrics={
          swrError ? (
            <span className="text-red-600 dark:text-red-400">{(swrError as Error).message}</span>
          ) : loading ? (
            <span className="text-slate-500">Loading applications…</span>
          ) : (
            <span className="flex flex-wrap gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{applications.length}</span>
              <span className="text-slate-500 dark:text-slate-400">applications on board</span>
            </span>
          )
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterDrawer(true)}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More filters
            </button>
            <button
              type="button"
              onClick={() => {
                void mutateApplications();
                void mutateJobs();
              }}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              Refresh board
            </button>
          </div>
        }
        banner={
          !canManage || (swrError && applications.length === 0) ? (
            <div className="space-y-3">
              {!canManage ? (
                <div className="text-sm text-amber-900 dark:text-amber-100">
                  <strong className="font-semibold">View-only mode.</strong> Drag/drop and stage updates require{" "}
                  <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/50">pipeline.manage</code> (or admin).
                </div>
              ) : null}
              {swrError && applications.length === 0 ? (
                <div className="flex flex-col gap-2 text-sm text-rose-900 dark:text-rose-100 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <strong className="font-semibold">Unable to load applications.</strong>{" "}
                    {(swrError as Error).message || "Request failed."}
                  </span>
                  <button
                    type="button"
                    className={UI.secondaryButton + " shrink-0 py-1.5 text-xs"}
                    onClick={() => void mutateApplications()}
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          ) : null
        }
      >
      <div className="space-y-4">

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/40 ring-1 ring-slate-100">
        <button
          type="button"
          onClick={() => setAssignOpen((p) => !p)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50/90 sm:px-6"
          aria-expanded={assignOpen}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
              <UserPlus className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                  Step 1
                </span>
                <span className="text-base font-bold text-slate-900">Add candidate to the board</span>
              </span>
              <span className="mt-0.5 block text-sm text-slate-600">
                Link an existing candidate to a job — creates an application in <strong className="font-semibold text-slate-800">Applied</strong>.
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-blue-700">
            {assignOpen ? (
              <>
                Collapse <ChevronUp className="h-5 w-5" aria-hidden />
              </>
            ) : (
              <>
                Expand <ChevronDown className="h-5 w-5" aria-hidden />
              </>
            )}
          </span>
        </button>
        {assignOpen ? (
          <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-5 sm:px-6 sm:py-6">
            <AssignApplicationForm onAssigned={() => void mutateApplications()} embedded />
          </div>
        ) : null}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-800 dark:text-slate-200">Step 2:</span> Drag cards between columns or reorder within a column; use the
        row ⋮ menu for interview scheduling and stage moves.
      </p>

      <div className="sticky top-[4.75rem] z-30 rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 lg:top-[7.25rem]">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[240px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/30"
            placeholder="Quick search candidate..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/30"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={String(j.id)}>
                {j.title}
                {j.company ? ` — ${j.company}` : ""}
              </option>
            ))}
          </select>
          <DensityToggle density={density} onChange={setDensity} />
          <button
            type="button"
            className={[
              "rounded-xl border px-3 py-2 text-sm font-medium transition",
              assignedTo === "me"
                ? "border-blue-500 bg-blue-50 text-blue-800"
                : "border-gray-200 bg-white text-slate-700 hover:bg-gray-50",
            ].join(" ")}
            onClick={() => setAssignedTo((v) => (v === "me" ? "" : "me"))}
            title="Show only cards where you are the assigned recruiter"
          >
            My queue
          </button>
          <button
            type="button"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-gray-50"
            onClick={() => {
              setQ("");
              setStage("");
              setJobId("");
              setAssignedTo("");
            }}
          >
            Clear
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStage("")}
            className={[
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
              stage === "" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            All stages
          </button>
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={[
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                stage === s ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {(error || swrError) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {(error || (swrError as Error)?.message || "Request failed") as string}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white shadow-sm p-4">
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div key={j} className="rounded-xl border p-4">
                    <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
                    <div className="mt-2 h-3 w-24 bg-slate-200 rounded animate-pulse" />
                    <div className="mt-4 flex gap-2">
                      <div className="h-6 w-14 bg-slate-200 rounded animate-pulse" />
                      <div className="h-6 w-14 bg-slate-200 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {!loading && applications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-200/80 bg-blue-50/40 px-4 py-3 text-center text-sm text-slate-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-slate-200">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Board is empty.</span> Use{" "}
              <span className="font-semibold text-blue-800 dark:text-blue-300">Step 1</span> above to add your first application — cards will appear in{" "}
              <strong>Applied</strong>.
              {debouncedQ || stage || jobId || assignedTo ? (
                <span className="mt-2 block text-slate-600 dark:text-slate-400">Or clear filters — the current query may match nothing.</span>
              ) : null}
            </div>
          ) : null}
          <PipelineBoard
            density={density}
            applications={applications}
            onStageUpdated={handleStageUpdated}
            onApplicationRemoved={() => void mutateApplications()}
            canManage={canManage}
            recruiters={recruiters}
            currentUserId={currentUserId}
          />
        </>
      )}
      </div>
      </ModulePageFrame>
    </AccessGate>
  );
}

