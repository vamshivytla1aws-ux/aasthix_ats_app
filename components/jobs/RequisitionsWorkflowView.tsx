"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SlidersHorizontal } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import FilterDrawer from "@/components/enterprise/FilterDrawer";
import ModuleDataTable, { type ModuleDataTableColumn } from "@/components/enterprise/ModuleDataTable";
import StatusBadge from "@/components/enterprise/StatusBadge";
import RowActionsMenu from "@/components/enterprise/RowActionsMenu";
import Toast from "@/components/Toast";
import DispositionReasonModal from "@/components/DispositionReasonModal";
import { jobStatusRequiresDispositionReason } from "@/lib/dispositionRules";
import {
  REQUISITION_WORKFLOW_STEPS,
  normalizeRequisitionStep,
  nextRequisitionStep,
  stepIndex,
  type RequisitionWorkflowStep,
} from "@/lib/requisitionWorkflow";

type ApprovalSummary = {
  id: number;
  job_id: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
};

// ─── Types ────────────────────────────────────────────────────────────────────

type JobRow = {
  id: number;
  title: string;
  company: string;
  location: string;
  status: string;
  open_positions?: number | null;
  employment_type?: string | null;
  created_at?: string | null;
  vendor_name?: string | null;
};

type EnrichedJobRow = JobRow & { workflowStep: RequisitionWorkflowStep };

type BatchJobResult = {
  id: number;
  ok: boolean;
  updated?: JobRow;
  error?: string;
};

/** Discriminated union for the single DispositionReasonModal instance */
type PendingDisposition =
  | { kind: "advance"; job: EnrichedJobRow; next: string }
  | { kind: "inline-status"; jobId: number; newStatus: string }
  | { kind: "bulk"; status: string };

// ─── PositionsInput — self-syncing number input ───────────────────────────────
// Must live outside the page component so React doesn't remount it on each render.

function PositionsInput({
  value,
  onSave,
  disabled,
}: {
  value: number | null | undefined;
  onSave: (v: number) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(String(value ?? ""));
  // Keep local state in sync when the backing SWR value changes (e.g., after PATCH).
  useEffect(() => {
    setLocal(String(value ?? ""));
  }, [value]);

  return (
    <input
      type="number"
      min={1}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = Number(local);
        if (Number.isFinite(n) && n >= 1) onSave(Math.trunc(n));
        else setLocal(String(value ?? "")); // revert on invalid
      }}
      disabled={disabled}
      className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right text-sm text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      aria-label="Open positions"
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RequisitionsWorkflowView() {
  const { density } = useDensity("ats:requisitions-density", "compact");
  const { data: jobs = [], error, isLoading, mutate } = useSWR<JobRow[]>(
    "/api/jobs",
    dashboardFetcher,
    { refreshInterval: 60_000 }
  );

  // ── Approvals (for pending-approval indicators)
  const { data: approvalsData, mutate: mutateApprovals } = useSWR<{
    approvals: ApprovalSummary[];
  }>("/api/approvals?status=pending", dashboardFetcher, { refreshInterval: 60_000 });
  const pendingApprovalJobIds = useMemo(() => {
    const set = new Set<number>();
    for (const a of approvalsData?.approvals ?? []) {
      if (a.status === "pending") set.add(a.job_id);
    }
    return set;
  }, [approvalsData]);

  // ── Filter state
  const [filterDrawer, setFilterDrawer] = useState(false);
  const [stepFilter, setStepFilter] = useState<"" | RequisitionWorkflowStep>("");
  const [q, setQ] = useState("");

  // ── Permission
  const [canManage, setCanManage] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetchJson<{
          user?: { role?: string };
          permissions?: Record<string, boolean>;
        }>("/api/auth/me");
        const role = (me.user?.role || "user").toLowerCase();
        const allowed =
          role === "admin" || me.permissions?.["jobs.manage"] !== false;
        if (!cancelled) setCanManage(allowed);
      } catch {
        if (!cancelled) setCanManage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Single-row busy state
  const [busyId, setBusyId] = useState<number | null>(null);

  // ── Toast
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  function showToast(message: string, variant: "success" | "error") {
    setToast({ message, variant });
  }

  // ── Multi-select
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ── Bulk UI state
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPositions, setBulkPositions] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // ── Unified disposition-reason modal state (replaces old pendingAdvance)
  const [pendingDisposition, setPendingDisposition] = useState<PendingDisposition | null>(null);

  // ── Derived / filtered data
  const enriched = useMemo(
    () => jobs.map((j) => ({ ...j, workflowStep: normalizeRequisitionStep(j.status) })),
    [jobs]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return enriched.filter((j) => {
      if (stepFilter && j.workflowStep !== stepFilter) return false;
      if (!needle) return true;
      const hay = [j.title, j.company, j.location, j.vendor_name || "", j.status]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [enriched, stepFilter, q]);

  const counts = useMemo(() => {
    const m = new Map<RequisitionWorkflowStep, number>();
    for (const s of REQUISITION_WORKFLOW_STEPS) m.set(s, 0);
    for (const j of enriched) {
      const c = m.get(j.workflowStep) ?? 0;
      m.set(j.workflowStep, c + 1);
    }
    return m;
  }, [enriched]);

  // ── Toast helpers
  function handleApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError && e.status === 403) {
      showToast(`${e.message} — jobs.manage is required to change requisition data.`, "error");
    } else {
      showToast((e as Error)?.message || fallback, "error");
    }
  }

  // ── Single-row PATCH: advance workflow step
  const runAdvancePatch = useCallback(
    async (job: JobRow, next: string, dispositionReasonId?: number) => {
      setBusyId(job.id);
      try {
        const body: Record<string, unknown> = { status: next };
        if (dispositionReasonId != null) body.disposition_reason_id = dispositionReasonId;
        const updated = await apiFetchJson<JobRow>(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await mutate(
          (prev) => (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
          { revalidate: false }
        );
        showToast(`Moved to "${next}".`, "success");
      } catch (e) {
        handleApiError(e, "Advance failed");
      } finally {
        setBusyId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate]
  );

  const advance = useCallback(
    (job: EnrichedJobRow) => {
      const next = nextRequisitionStep(job.workflowStep);
      if (!next) {
        showToast("Already at terminal workflow step.", "error");
        return;
      }
      if (jobStatusRequiresDispositionReason(next)) {
        setPendingDisposition({ kind: "advance", job, next });
        return;
      }
      void runAdvancePatch(job, next);
    },
    [runAdvancePatch]
  );

  // ── Single-row PATCH: inline status edit
  const runInlineStatusPatch = useCallback(
    async (jobId: number, newStatus: string, dispositionReasonId?: number) => {
      setBusyId(jobId);
      try {
        const body: Record<string, unknown> = { status: newStatus };
        if (dispositionReasonId != null) body.disposition_reason_id = dispositionReasonId;
        const updated = await apiFetchJson<JobRow>(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await mutate(
          (prev) => (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
          { revalidate: false }
        );
        showToast(`Status updated to "${newStatus}".`, "success");
      } catch (e) {
        handleApiError(e, "Status update failed");
      } finally {
        setBusyId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate]
  );

  const handleInlineStatus = useCallback(
    (job: EnrichedJobRow, newStatus: string) => {
      if (!canManage || newStatus === job.status) return;
      if (jobStatusRequiresDispositionReason(newStatus)) {
        setPendingDisposition({ kind: "inline-status", jobId: job.id, newStatus });
        return;
      }
      void runInlineStatusPatch(job.id, newStatus);
    },
    [canManage, runInlineStatusPatch]
  );

  // ── Single-row PATCH: inline open_positions edit
  const runInlinePositionsPatch = useCallback(
    async (jobId: number, positions: number) => {
      setBusyId(jobId);
      try {
        const updated = await apiFetchJson<JobRow>(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ open_positions: positions }),
        });
        await mutate(
          (prev) => (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
          { revalidate: false }
        );
        showToast(`Openings updated to ${positions}.`, "success");
      } catch (e) {
        handleApiError(e, "Openings update failed");
      } finally {
        setBusyId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate]
  );

  // ── Bulk PATCH via /api/jobs/batch
  const runBulkPatch = useCallback(
    async (opts: {
      status?: string;
      positions?: number;
      dispositionReasonId?: number;
    }) => {
      if (selectedIds.length === 0) return;
      setBulkBusy(true);
      try {
        const jobItems = selectedIds.map((id) => {
          const item: Record<string, unknown> = { id };
          if (opts.status != null) item.status = opts.status;
          if (opts.positions != null) item.open_positions = opts.positions;
          if (opts.dispositionReasonId != null)
            item.disposition_reason_id = opts.dispositionReasonId;
          return item;
        });

        const res = await apiFetchJson<{ results: BatchJobResult[] }>("/api/jobs/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs: jobItems }),
        });

        const updatedMap = new Map<number, JobRow>();
        let errorCount = 0;
        for (const r of res.results) {
          if (r.ok && r.updated) updatedMap.set(r.id, r.updated);
          else if (!r.ok) errorCount++;
        }

        if (updatedMap.size > 0) {
          await mutate(
            (prev) =>
              (prev ?? []).map((r) =>
                updatedMap.has(r.id) ? { ...r, ...(updatedMap.get(r.id) as JobRow) } : r
              ),
            { revalidate: false }
          );
        }

        const okCount = res.results.filter((r) => r.ok).length;
        if (errorCount > 0) {
          showToast(`${okCount} updated, ${errorCount} failed — check each row.`, "error");
        } else {
          showToast(`${okCount} job(s) updated.`, "success");
        }

        setSelectedIds([]);
        setBulkStatus("");
        setBulkPositions("");
      } catch (e) {
        handleApiError(e, "Bulk update failed");
      } finally {
        setBulkBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, mutate]
  );

  // ── Submit for approval (from requisitions list)
  const submitApproval = useCallback(
    async (jobId: number) => {
      setBusyId(jobId);
      try {
        await apiFetchJson("/api/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId }),
        });
        showToast("Approval submitted — job moved to Pending Approval.", "success");
        void mutate();
        void mutateApprovals();
      } catch (e) {
        handleApiError(e, "Failed to submit approval");
      } finally {
        setBusyId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate, mutateApprovals]
  );

  // ── Disposition modal confirm handler (all three kinds)
  async function onDispositionConfirm(reasonId: number) {
    if (!pendingDisposition) return;
    const p = pendingDisposition;
    setPendingDisposition(null);
    switch (p.kind) {
      case "advance":
        await runAdvancePatch(p.job, p.next, reasonId);
        break;
      case "inline-status":
        await runInlineStatusPatch(p.jobId, p.newStatus, reasonId);
        break;
      case "bulk":
        await runBulkPatch({ status: p.status, dispositionReasonId: reasonId });
        break;
    }
  }

  // ── Columns (includes checkbox + inline-editable cells)
  const columns: ModuleDataTableColumn<EnrichedJobRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: "",
        defaultVisible: true,
        csvValue: () => "",
        cell: (r) =>
          canManage ? (
            <input
              type="checkbox"
              aria-label={`Select ${r.title}`}
              checked={selectedIds.includes(r.id)}
              onChange={(e) =>
                setSelectedIds((prev) =>
                  e.target.checked
                    ? Array.from(new Set([...prev, r.id]))
                    : prev.filter((x) => x !== r.id)
                )
              }
            />
          ) : null,
      },
      {
        id: "title",
        header: "Requisition",
        csvValue: (r) => r.title,
        sortValue: (r) => r.title,
        cell: (r) => (
          <div>
            <Link
              href={`/jobs/${r.id}`}
              className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
            >
              {r.title}
            </Link>
            <div className="text-xs text-slate-500 dark:text-slate-400">#{r.id}</div>
          </div>
        ),
      },
      {
        id: "company",
        header: "Company",
        csvValue: (r) => r.company,
        sortValue: (r) => r.company,
        cell: (r) => r.company,
      },
      {
        id: "location",
        header: "Location",
        defaultVisible: true,
        csvValue: (r) => r.location,
        sortValue: (r) => r.location,
        cell: (r) => r.location,
      },
      {
        id: "workflow",
        header: "Status",
        csvValue: (r) => r.status,
        sortValue: (r) => stepIndex(r.workflowStep),
        cell: (r) => {
          const hasPending = pendingApprovalJobIds.has(r.id);
          if (!canManage) {
            return (
              <span className="inline-flex items-center gap-1.5">
                <StatusBadge status={r.workflowStep} />
                {hasPending && (
                  <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" title="Pending approval" />
                )}
              </span>
            );
          }
          const stdOptions = REQUISITION_WORKFLOW_STEPS as readonly string[];
          const allOptions = stdOptions.includes(r.status)
            ? stdOptions
            : [...stdOptions, r.status];
          return (
            <span className="inline-flex items-center gap-1.5">
              <select
                value={r.status}
                onChange={(e) => handleInlineStatus(r, e.target.value)}
                disabled={busyId === r.id || bulkBusy}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                aria-label={`Status for ${r.title}`}
              >
                {allOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {hasPending && (
                <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" title="Pending approval" />
              )}
            </span>
          );
        },
      },
      {
        id: "openings",
        header: "Openings",
        csvValue: (r) => String(r.open_positions ?? ""),
        sortValue: (r) => Number(r.open_positions) || 0,
        align: "right",
        cell: (r) =>
          canManage ? (
            <PositionsInput
              value={r.open_positions}
              onSave={(v) => void runInlinePositionsPatch(r.id, v)}
              disabled={busyId === r.id || bulkBusy}
            />
          ) : (
            <span>{r.open_positions ?? "—"}</span>
          ),
      },
      {
        id: "employment",
        header: "Employment",
        csvValue: (r) => String(r.employment_type || ""),
        sortValue: (r) => r.employment_type || "",
        cell: (r) => r.employment_type || "—",
      },
      {
        id: "created",
        header: "Created",
        csvValue: (r) => r.created_at || "",
        sortValue: (r) => r.created_at || "",
        cell: (r) => formatDate(r.created_at),
      },
      {
        id: "actions",
        header: "Actions",
        defaultVisible: true,
        csvValue: () => "",
        cell: (r) => {
          const next = nextRequisitionStep(r.workflowStep);
          const isDraft = r.workflowStep === "Draft";
          const hasPending = pendingApprovalJobIds.has(r.id);
          return (
            <div className={busyId === r.id ? "pointer-events-none opacity-50" : ""}>
              <RowActionsMenu
                ariaLabel={`Requisition actions ${r.title}`}
                items={[
                  { type: "link", label: "Open job record", href: `/jobs/${r.id}` },
                  ...(isDraft && !hasPending && canManage
                    ? [
                        {
                          type: "button" as const,
                          label: "Submit for approval",
                          onClick: () => void submitApproval(r.id),
                        },
                      ]
                    : []),
                  ...(next && !(isDraft && next === "Pending Approval")
                    ? [
                        {
                          type: "button" as const,
                          label: `Advance to ${next}`,
                          onClick: () => advance(r),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          );
        },
      },
    ],
    [
      advance,
      busyId,
      bulkBusy,
      canManage,
      handleInlineStatus,
      pendingApprovalJobIds,
      runInlinePositionsPatch,
      selectedIds,
      submitApproval,
    ]
  );

  // ── Bulk bar (rendered in ModuleDataTable toolbarLeft slot)
  const bulkBar =
    canManage && selectedIds.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800">
          {selectedIds.length} selected
        </span>

        {/* Bulk status */}
        <select
          value={bulkStatus}
          onChange={(e) => setBulkStatus(e.target.value)}
          disabled={bulkBusy}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          aria-label="Bulk target status"
        >
          <option value="">Set status…</option>
          {REQUISITION_WORKFLOW_STEPS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!bulkStatus || bulkBusy}
          onClick={() => {
            if (!bulkStatus) return;
            if (jobStatusRequiresDispositionReason(bulkStatus)) {
              setPendingDisposition({ kind: "bulk", status: bulkStatus });
            } else {
              void runBulkPatch({ status: bulkStatus });
            }
          }}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
        >
          {bulkBusy ? "Working…" : "Apply status"}
        </button>

        {/* Bulk openings */}
        <input
          type="number"
          min={1}
          value={bulkPositions}
          onChange={(e) => setBulkPositions(e.target.value)}
          placeholder="Openings"
          disabled={bulkBusy}
          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-right text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          aria-label="Bulk open positions"
        />
        <button
          type="button"
          disabled={!bulkPositions || bulkBusy}
          onClick={() => {
            const p = Number(bulkPositions);
            if (Number.isFinite(p) && p >= 1)
              void runBulkPatch({ positions: Math.trunc(p) });
          }}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          {bulkBusy ? "Working…" : "Apply openings"}
        </button>

        <button
          type="button"
          onClick={() => setSelectedIds([])}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
        >
          Clear
        </button>
      </div>
    ) : canManage && filtered.length > 0 ? (
      <button
        type="button"
        onClick={() => setSelectedIds(filtered.map((r) => r.id))}
        className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        Select all shown ({filtered.length})
      </button>
    ) : null;

  const loadError = error ? (error as Error).message : null;
  const skeleton = isLoading && jobs.length === 0;

  // ── Disposition modal title/description
  const dispositionTitle =
    pendingDisposition?.kind === "advance"
      ? "Advance requisition"
      : pendingDisposition?.kind === "inline-status"
        ? "Update status"
        : "Bulk status update";

  const dispositionDesc =
    pendingDisposition?.kind === "advance"
      ? `Moving to "${pendingDisposition.next}" requires a disposition reason.`
      : pendingDisposition?.kind === "inline-status"
        ? `Setting status to "${pendingDisposition.newStatus}" requires a disposition reason.`
        : pendingDisposition?.kind === "bulk"
          ? `Setting ${selectedIds.length} job(s) to "${pendingDisposition.status}" requires a disposition reason.`
          : undefined;

  return (
    <AccessGate permissionKey="jobs.view">
      <DispositionReasonModal
        open={pendingDisposition !== null}
        reasonSet="job_close"
        title={dispositionTitle}
        description={dispositionDesc}
        confirmLabel="Apply"
        onClose={() => setPendingDisposition(null)}
        onConfirm={(reasonId) => void onDispositionConfirm(reasonId)}
      />

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
          autoHideMs={3500}
        />
      ) : null}

      <FilterDrawer
        open={filterDrawer}
        onClose={() => setFilterDrawer(false)}
        title="Requisition filters"
        onApply={() => setFilterDrawer(false)}
        onReset={() => {
          setStepFilter("");
          setQ("");
          setFilterDrawer(false);
        }}
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Workflow step
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={stepFilter}
              onChange={(e) =>
                setStepFilter((e.target.value || "") as "" | RequisitionWorkflowStep)
              }
            >
              <option value="">All steps</option>
              {REQUISITION_WORKFLOW_STEPS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Search
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              placeholder="Title, company, location…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </FilterDrawer>

      <ModulePageFrame
        title="Jobs"
        subtitle="JD and posting lifecycle — inline-edit status and openings, bulk-update selections, or advance step-by-step."
        metrics={
          loadError ? (
            <span className="text-red-600 dark:text-red-400">{loadError}</span>
          ) : skeleton ? (
            <span className="text-slate-500">Loading…</span>
          ) : (
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {filtered.length}
                </span>
                <span className="text-slate-500 dark:text-slate-400"> shown</span>
              </span>
              {REQUISITION_WORKFLOW_STEPS.map((s) => (
                <span key={s} className="text-slate-500 dark:text-slate-400">
                  {s}:{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {counts.get(s) ?? 0}
                  </span>
                </span>
              ))}
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
              onClick={() => void mutate()}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              Refresh
            </button>
            <Link href="/jobs?view=standard" className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}>
              Standard view
            </Link>
            <Link
              href="/pipeline"
              className={UI.secondaryButton + " inline-flex items-center gap-1 py-2 text-xs"}
            >
              Hiring hub (Pipeline →)
            </Link>
            <Link
              href="/audit"
              className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}
            >
              Audit trail
            </Link>
            <Link
              href="/recruiter/workload"
              className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}
            >
              Recruiter workload
            </Link>
          </div>
        }
        banner={
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <strong className="text-slate-800 dark:text-slate-200">How it works:</strong>{" "}
              Workflow is derived from{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">
                jobs.status
              </code>
              . Inline-edit the <strong>Status</strong> dropdown or{" "}
              <strong>Openings</strong> field directly in each row (requires{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">
                jobs.manage
              </code>
              ). Closing, filling, or placing on hold requires a disposition reason for audit.
            </p>
            {!canManage ? (
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                View-only — you need{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/50">
                  jobs.manage
                </code>{" "}
                (or admin) to edit or bulk-update.
              </p>
            ) : null}
          </div>
        }
      >
        {/* Lifecycle ribbon */}
        <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Lifecycle
          </span>
          <div className="flex flex-wrap gap-2">
            {REQUISITION_WORKFLOW_STEPS.map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 ? <span className="text-slate-300 dark:text-slate-600">→</span> : null}
                <button
                  type="button"
                  onClick={() =>
                    setStepFilter((prev) => (prev === s ? "" : (s as RequisitionWorkflowStep)))
                  }
                  className={[
                    "rounded-lg px-2 py-1 text-xs font-medium shadow-sm ring-1 transition",
                    stepFilter === s
                      ? "bg-blue-600 text-white ring-blue-600"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600",
                  ].join(" ")}
                >
                  {s}{" "}
                  <span className={stepFilter === s ? "text-blue-200" : "text-slate-400 dark:text-slate-500"}>
                    ({counts.get(s) ?? 0})
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {skeleton ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          </div>
        ) : loadError && jobs.length === 0 ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/40">
            <p className="font-semibold text-rose-900 dark:text-rose-100">{loadError}</p>
            <button
              type="button"
              className={UI.secondaryButton + " mt-3 py-2 text-xs"}
              onClick={() => void mutate()}
            >
              Retry
            </button>
          </div>
        ) : (
          <ModuleDataTable
            rows={filtered}
            rowKey={(r) => r.id}
            columns={columns}
            storageKey="ats:requisitions-table-columns"
            density={density}
            exportBasename="requisitions"
            maxBodyHeight="min(68vh, 680px)"
            toolbarLeft={bulkBar}
            emptyMessage={
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  No requisitions match
                </div>
                <p className="mt-1">Clear filters or create a job from the Jobs page.</p>
              </div>
            }
          />
        )}
      </ModulePageFrame>
    </AccessGate>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}
