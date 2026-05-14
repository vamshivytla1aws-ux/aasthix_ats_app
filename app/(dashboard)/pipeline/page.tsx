"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ChevronDown, ChevronUp, SlidersHorizontal, UserPlus } from "lucide-react";
import AssignApplicationForm from "@/components/AssignApplicationForm";
import PipelineBoard from "@/components/PipelineBoard";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import DensityToggle from "@/components/ui/DensityToggle";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import ContextualCopilotPanel from "@/components/enterprise/ContextualCopilotPanel";
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
  interview_round_history?: Array<{
    previous_round_order?: number | null;
    new_round_order?: number | null;
    previous_round_label?: string | null;
    new_round_label?: string | null;
    event_type?: string | null;
    audience?: string | null;
    created_at?: string | null;
  }> | null;
};

type RecruiterOption = { id: number; full_name: string; email?: string | null };

function PipelinePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const appFromUrl = useMemo(() => {
    const raw = searchParams.get("app") ?? searchParams.get("application"); 
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const companyFromUrl = useMemo(() => (searchParams.get("company") ?? "").trim(), [searchParams]);

  const { density, setDensity } = useDensity("ats:pipeline-density", "compact");
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(true);

  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [company, setCompany] = useState<string>(companyFromUrl);
  /** "" = all owners, "me" = my queue (assigned_recruiter = current user) */
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState<Set<number>>(() => new Set());
  const [viewNameDraft, setViewNameDraft] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkToast, setBulkToast] = useState<string | null>(null);
  const [bulkStage, setBulkStage] = useState<Stage | "">("");
  const [bulkDispositionId, setBulkDispositionId] = useState<string>("");
  const [bulkAssignUserId, setBulkAssignUserId] = useState<string>("");

  const [debouncedQ, setDebouncedQ] = useState(q);
  const [assignOpen, setAssignOpen] = useState(true);
  const [filterDrawer, setFilterDrawer] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setCompany(companyFromUrl);
  }, [companyFromUrl]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (company) nextParams.set("company", company);
    else nextParams.delete("company");
    const nextQs = nextParams.toString();
    const currentQs = searchParams.toString();
    if (nextQs === currentQs) return;
    router.replace(`${pathname}${nextQs ? `?${nextQs}` : ""}`, { scroll: false });
  }, [company, pathname, router, searchParams]);

  const applicationsKey = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ.trim().length > 0) params.set("q", debouncedQ.trim());
    if (stage) params.set("stage", stage);
    if (jobId) params.set("job_id", jobId);
    if (company) params.set("company", company);
    if (assignedTo === "me") params.set("assigned_to", "me");
    const qs = params.toString();
    return `/api/applications${qs ? `?${qs}` : ""}`;
  }, [debouncedQ, stage, jobId, company, assignedTo]);

  const companySummaryKey = useMemo(() => {
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
    isValidating,
    mutate: mutateApplications,
  } = useSWR<ApplicationRow[]>(applicationsKey, dashboardFetcher, {
    refreshInterval: 60_000,
    onError: (err) => setError((err as Error)?.message || "Something went wrong"),
    onSuccess: () => setError(null),
  });

  const { data: companySummaryApplications = [], mutate: mutateCompanySummary } = useSWR<ApplicationRow[]>(
    companySummaryKey,
    dashboardFetcher,
    {
      refreshInterval: 60_000,
    }
  );

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

  const { data: savedViewsData, mutate: mutateSavedViews } = useSWR<{ views: { id: number; name: string; filters: Record<string, unknown> }[] }>(
    "/api/user/saved-views?page=pipeline",
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );

  const { data: rejectReasonData } = useSWR<{ reasons: { id: number; label: string }[] }>(
    bulkStage === "Rejected" ? "/api/disposition-reasons?category=reject" : null,
    dashboardFetcher
  );
  const rejectReasonRows = rejectReasonData?.reasons ?? [];

  const numericJobId = useMemo(() => {
    const n = Number(jobId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [jobId]);

  const { data: activeJob } = useSWR<{ pipeline_wip_limits?: Record<string, number> | null }>(
    numericJobId ? `/api/jobs/${numericJobId}` : null,
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );

  const wipLimitsOverride = useMemo(() => {
    const raw = activeJob?.pipeline_wip_limits;
    if (!raw || typeof raw !== "object") return undefined;
    const out: Partial<Record<Stage, number>> = {};
    for (const s of STAGES) {
      const v = raw[s];
      if (typeof v === "number" && Number.isFinite(v) && v >= 1) out[s] = Math.trunc(v);
    }
    return Object.keys(out).length ? out : undefined;
  }, [activeJob?.pipeline_wip_limits]);

  const { data: pipeAnalytics } = useSWR<{
    bottlenecks: Array<{ stage: string; reason: string; severity: string }>;
    avg_time_in_stage: Record<string, number>;
  }>("/api/analytics/pipeline", dashboardFetcher, { refreshInterval: 120_000 });

  const loading = isLoading && applications.length === 0;

  const toggleAppSelect = useCallback((id: number) => {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  function applySavedView(f: Record<string, unknown>) {
    setQ(String(f.q ?? ""));
    setStage(String(f.stage ?? ""));
    setJobId(String(f.job_id ?? ""));
    setCompany(String(f.company ?? ""));
    setAssignedTo(String(f.assigned_to ?? ""));
  }

  async function savePipelineView() {
    const name = viewNameDraft.trim() || "My filters";
    try {
      await apiFetchJson("/api/user/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "pipeline",
          name,
          filters: { q: debouncedQ, stage, job_id: jobId, company, assigned_to: assignedTo },
        }),
      });
      setBulkToast(`Saved “${name}”.`);
      void mutateSavedViews();
    } catch (e: any) {
      setBulkToast(e?.message || "Save failed");
    }
  }

  async function runBulkAssign() {
    const uid = bulkAssignUserId === "" ? null : Number(bulkAssignUserId);
    if (bulkAssignUserId !== "" && (!Number.isFinite(uid) || (uid as number) <= 0)) {
      setBulkToast("Pick a valid owner or leave empty to clear.");
      return;
    }
    setBulkBusy(true);
    setBulkToast(null);
    try {
      await apiFetchJson("/api/applications/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_ids: Array.from(selectedAppIds),
          assigned_recruiter_user_id: uid,
        }),
      });
      setBulkToast(`Updated owner on ${selectedAppIds.size} card(s).`);
      setSelectedAppIds(new Set());
      void mutateApplications();
    } catch (e: any) {
      const msg = e instanceof ApiError && e.status === 403 ? `${e.message} — pipeline.manage required.` : e?.message || "Failed";
      setBulkToast(msg);
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkStage() {
    if (!bulkStage) {
      setBulkToast("Choose a target stage.");
      return;
    }
    setBulkBusy(true);
    setBulkToast(null);
    try {
      await apiFetchJson("/api/applications/bulk-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_ids: Array.from(selectedAppIds),
          stage: bulkStage,
          disposition_reason_id: bulkStage === "Rejected" ? Number(bulkDispositionId) : undefined,
        }),
      });
      setBulkToast(`Moved ${selectedAppIds.size} application(s).`);
      setSelectedAppIds(new Set());
      setBulkStage("");
      setBulkDispositionId("");
      void mutateApplications();
    } catch (e: any) {
      setBulkToast(e?.message || "Bulk stage failed");
    } finally {
      setBulkBusy(false);
    }
  }

  const stageCounts = STAGES.reduce<Record<Stage, number>>(
    (acc, s) => {
      acc[s] = applications.filter((a) => a.stage === s).length;
      return acc;
    },
    { Applied: 0, Screening: 0, "Screening Failed": 0, Interview: 0, Selected: 0, Rejected: 0 }
  );

  const companyOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const job of jobs) {
      const value = String(job.company ?? "").trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
    return values.sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const companySummaryRows = useMemo(() => {
    const byCompany = new Map<string, { total: number; applied: number; screening: number; interview: number }>();
    for (const row of companySummaryApplications) {
      const raw = String(row.job_company ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const current = byCompany.get(key) ?? { total: 0, applied: 0, screening: 0, interview: 0 };
      current.total += 1;
      if (row.stage === "Applied") current.applied += 1;
      if (row.stage === "Screening") current.screening += 1;
      if (row.stage === "Interview") current.interview += 1;
      byCompany.set(key, current);
    }
    return Array.from(byCompany.entries())
      .map(([key, value]) => ({
        key,
        company: companyOptions.find((name) => name.toLowerCase() === key) ?? key,
        ...value,
      }))
      .sort((a, b) => b.total - a.total || a.company.localeCompare(b.company));
  }, [companySummaryApplications, companyOptions]);

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
          setCompany("");
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
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Company</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">All companies</option>
              {companyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
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
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 dark:text-slate-300">
                Scope: <span className="font-medium text-slate-800 dark:text-slate-100">{company || "All companies"}</span>
              </span>
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
              Filters
            </button>
            <button
              type="button"
              onClick={() => {
                void mutateApplications();
                void mutateCompanySummary();
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
      {appFromUrl ? (
        <ContextualCopilotPanel scope="application" entityId={appFromUrl} subtitle={`Application #${appFromUrl}`} />
      ) : null}

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

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400">Saved view</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
              defaultValue=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (!Number.isFinite(id) || id <= 0) return;
                const v = savedViewsData?.views?.find((x) => x.id === id);
                if (v?.filters) applySavedView(v.filters as Record<string, unknown>);
                e.target.value = "";
              }}
            >
              <option value="">Load…</option>
              {savedViewsData?.views?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <input
            placeholder="Name this filter set"
            value={viewNameDraft}
            onChange={(e) => setViewNameDraft(e.target.value)}
            className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
          />
          <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void savePipelineView()}>
            Save view
          </button>
          <button
            type="button"
            className={[
              UI.secondaryButton + " py-1.5 text-xs",
              bulkSelectMode ? " ring-2 ring-blue-500 ring-offset-1" : "",
            ].join(" ")}
            onClick={() => {
              setBulkSelectMode((v) => !v);
              setSelectedAppIds(new Set());
            }}
          >
            {bulkSelectMode ? "Exit bulk select" : "Bulk select"}
          </button>
        </div>
        {bulkToast ? <div className="mt-2 text-xs text-amber-900 dark:text-amber-200">{bulkToast}</div> : null}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-800 dark:text-slate-200">Step 2:</span> Drag cards between columns or reorder within a column; use the
        row ⋮ menu for interview scheduling and stage moves.
      </p>

      <div className="sticky top-[5.5rem] z-30 rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 sm:top-[5.75rem] lg:top-[7.25rem]">
        {pipeAnalytics?.bottlenecks && pipeAnalytics.bottlenecks.length > 0 ? (
          <div className="mb-2 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            <span className="font-semibold">Pipeline signals: </span>
            {pipeAnalytics.bottlenecks.slice(0, 2).map((b) => b.reason).join(" · ")}
            {typeof pipeAnalytics.avg_time_in_stage?.Interview === "number" ? (
              <span className="ml-1 opacity-90">
                · Interview avg {pipeAnalytics.avg_time_in_stage.Interview.toFixed(1)}d in stage
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={searchInputRef}
            className="min-w-[240px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/30"
            placeholder="Quick search (press /)"
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
              setCompany("");
              setAssignedTo("");
            }}
          >
            Clear
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {companyOptions.length <= 8 ? (
            <>
              <button
                type="button"
                onClick={() => setCompany("")}
                className={[
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                  company === "" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ].join(" ")}
              >
                All companies
              </button>
              {companyOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCompany(name)}
                  className={[
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                    company === name ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {name}
                </button>
              ))}
            </>
          ) : (
            <select
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">All companies</option>
              {companyOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
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

      {companySummaryRows.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Company summary</div>
          <div className="flex flex-wrap gap-2">
            {companySummaryRows.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => setCompany(row.company)}
                className={[
                  "rounded-lg border px-2.5 py-1 text-xs transition",
                  company === row.company
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                {row.company} · Applied {row.applied} · Screening {row.screening} · Interview {row.interview}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {(error || swrError) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {(error || (swrError as Error)?.message || "Request failed") as string}
        </div>
      )}

      {loading ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/50">
          <div className="grid min-w-[1080px] grid-cols-3 gap-3 md:min-w-[1200px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40"
              >
                <div className="h-10 rounded-lg bg-slate-200/90 animate-pulse dark:bg-slate-700" />
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 2 }).map((__, j) => (
                    <div key={j} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800/80">
                      <div className="h-3 w-32 rounded bg-slate-200 animate-pulse dark:bg-slate-600" />
                      <div className="mt-2 h-3 w-24 rounded bg-slate-200 animate-pulse dark:bg-slate-600" />
                      <div className="mt-3 h-8 w-8 rounded-lg bg-slate-200 animate-pulse dark:bg-slate-600" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">Loading pipeline…</p>
        </div>
      ) : (
        <>
          {!loading && applications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-200/80 bg-blue-50/40 px-4 py-3 text-center text-sm text-slate-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-slate-200">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Board is empty.</span> Use{" "}
              <span className="font-semibold text-blue-800 dark:text-blue-300">Step 1</span> above to add your first application — cards will appear in{" "}
              <strong>Applied</strong>.
              {debouncedQ || stage || jobId || company || assignedTo ? (
                <span className="mt-2 block text-slate-600 dark:text-slate-400">Or clear filters — the current query may match nothing.</span>
              ) : null}
            </div>
          ) : null}
          {selectedAppIds.size > 0 && canManage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40">
              <div className="font-semibold text-amber-950 dark:text-amber-100">
                {selectedAppIds.size} selected — bulk actions
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-amber-800/80 dark:text-amber-300/90">Assign owner</label>
                  <select
                    className="rounded-lg border border-amber-200/80 bg-white px-2 py-1.5 text-xs dark:border-amber-800 dark:bg-slate-900"
                    value={bulkAssignUserId}
                    onChange={(e) => setBulkAssignUserId(e.target.value)}
                  >
                    <option value="">Clear owner</option>
                    {recruiters.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={bulkBusy}
                  className={UI.primaryButton + " py-1.5 text-xs"}
                  onClick={() => void runBulkAssign()}
                >
                  Apply owner
                </button>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-amber-800/80 dark:text-amber-300/90">Move to stage</label>
                  <select
                    className="rounded-lg border border-amber-200/80 bg-white px-2 py-1.5 text-xs dark:border-amber-800 dark:bg-slate-900"
                    value={bulkStage}
                    onChange={(e) => setBulkStage((e.target.value || "") as Stage | "")}
                  >
                    <option value="">Choose…</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {bulkStage === "Rejected" ? (
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-800/80">Reason</label>
                    <select
                      className="rounded-lg border border-amber-200/80 bg-white px-2 py-1.5 text-xs dark:border-amber-800 dark:bg-slate-900"
                      value={bulkDispositionId}
                      onChange={(e) => setBulkDispositionId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {rejectReasonRows.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={bulkBusy || !bulkStage}
                  className={UI.primaryButton + " py-1.5 text-xs"}
                  onClick={() => void runBulkStage()}
                >
                  Apply stage
                </button>
                <button
                  type="button"
                  className={UI.secondaryButton + " py-1.5 text-xs"}
                  onClick={() => setSelectedAppIds(new Set())}
                >
                  Clear selection
                </button>
              </div>
            </div>
          ) : null}
          {applications.length > 0 ? (
            <PipelineBoard
              density={density}
              applications={applications}
              onStageUpdated={handleStageUpdated}
              onApplicationRemoved={() => void mutateApplications()}
              canManage={canManage}
              recruiters={recruiters}
              currentUserId={currentUserId}
              bulkSelectMode={bulkSelectMode}
              selectedApplicationIds={selectedAppIds}
              onToggleApplicationSelected={toggleAppSelect}
              wipLimitsOverride={wipLimitsOverride}
              staleDaysThreshold={7}
              isRefreshing={Boolean(isValidating && applications.length > 0)}
            />
          ) : null}
        </>
      )}
      </div>
      </ModulePageFrame>
    </AccessGate>
  );
}

export default function PipelinePage() {
  return (
    <Suspense
      fallback={
        <AccessGate permissionKey="pipeline.view">
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading pipeline…</div>
        </AccessGate>
      }
    >
      <PipelinePageContent />
    </Suspense>
  );
}
