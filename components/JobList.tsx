import React, { useEffect, useMemo, useRef, useState } from "react";
import DispositionReasonModal from "@/components/DispositionReasonModal";
import { jobStatusRequiresDispositionReason } from "@/lib/dispositionRules";
import { ArrowDownAZ, ArrowUpAZ, Download, Search, Trash2, X } from "lucide-react";
import type { Density } from "@/lib/useDensity";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import JobMatchHubModal from "@/components/JobMatchHubModal";
import StatusBadge from "@/components/enterprise/StatusBadge";
import RowActionsMenu, { type RowActionItem } from "@/components/enterprise/RowActionsMenu";
import { UI } from "@/lib/ui";
import { REQUISITION_WORKFLOW_STEPS, normalizeRequisitionStep } from "@/lib/requisitionWorkflow";

type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  status: string;
  description?: string | null;
  open_positions?: number | null;
  employment_type?: string | null;
  experience_requirement?: string | null;
  created_at?: string | null;
  vendor_name?: string | null;
};
type JobQuestion = {
  id?: number;
  category: "technical" | "scenario" | "behavioral" | "hr";
  question: string;
  sort_order?: number;
};

type Props = {
  jobs: Job[];
  /** When true, show row checkboxes and bulk delete (requires jobs.manage). */
  canManageJobs?: boolean;
  onView: (job: Job) => void;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => Promise<void>;
  density?: Density;
  /** Call after inline PATCH (e.g. status) so SWR parent can revalidate */
  onJobsRefresh?: () => void;
};

export function JobList({
  jobs,
  canManageJobs = false,
  onView: _onView,
  onEdit,
  onDelete,
  density = "compact",
  onJobsRefresh,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "Open" | "Closed">("");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>("");
  const [sortField, setSortField] = useState<"title" | "company" | "location" | "status" | "created_at">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState({
    title: true,
    company: true,
    location: true,
    openPositions: true,
    employmentType: true,
    status: true,
    createdAt: true,
    actions: true,
  });
  const [sendJdOpen, setSendJdOpen] = useState(false);
  const [sendJdJob, setSendJdJob] = useState<Job | null>(null);
  const [sendJdEmails, setSendJdEmails] = useState("");
  const [sendJdSubject, setSendJdSubject] = useState("");
  const [sendJdMessage, setSendJdMessage] = useState("");
  const [sendJdBusy, setSendJdBusy] = useState(false);
  const [sendJdError, setSendJdError] = useState<string | null>(null);
  const [sendJdSuccess, setSendJdSuccess] = useState<string | null>(null);
  const [sendJdConfirmed, setSendJdConfirmed] = useState(false);
  const [matchHubJob, setMatchHubJob] = useState<Job | null>(null);
  const [jobDisposition, setJobDisposition] = useState<{ job: Job; nextStatus: string } | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questionsJob, setQuestionsJob] = useState<Job | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questions, setQuestions] = useState<JobQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const pageSelectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const valid = new Set(jobs.map((j) => j.id));
    setSelectedIds((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
  }, [jobs]);

  const hasActiveFilters = search.trim().length > 0 || Boolean(statusFilter) || Boolean(employmentTypeFilter);
  const hasCustomView = statusFilter !== "" || sortField !== "created_at" || sortOrder !== "desc";
  const rowCellClass =
    density === "comfortable"
      ? "px-6 py-4"
      : density === "compact"
        ? "px-6 py-3"
        : "px-6 py-2.5";
  const headerCellClass =
    density === "comfortable"
      ? "sticky top-0 z-10 bg-gray-50 px-6 py-3 dark:bg-slate-900"
      : density === "compact"
        ? "sticky top-0 z-10 bg-gray-50 px-6 py-2.5 dark:bg-slate-900"
        : "sticky top-0 z-10 bg-gray-50 px-6 py-2 dark:bg-slate-900";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      const statusMatch = !statusFilter || (j.status || "Open").toLowerCase() === statusFilter.toLowerCase();
      if (!statusMatch) return false;
      const empMatch = !employmentTypeFilter || String(j.employment_type || "Full Time") === employmentTypeFilter;
      if (!empMatch) return false;
      if (!q) return true;
      const hay = [j.title, j.company, j.location, j.vendor_name || ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, search, statusFilter, employmentTypeFilter]);
  const openCount = useMemo(
    () => filtered.filter((j) => (j.status || "Open").toLowerCase().includes("open")).length,
    [filtered]
  );
  const closedCount = useMemo(
    () => filtered.filter((j) => (j.status || "").toLowerCase().includes("closed")).length,
    [filtered]
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortField === "created_at" ? (a.created_at || "") : (a[sortField] || "");
      const bv = sortField === "created_at" ? (b.created_at || "") : (b[sortField] || "");
      const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize, totalPages]);

  useEffect(() => {
    const el = pageSelectAllRef.current;
    if (!el || !canManageJobs) return;
    const some = paged.some((j) => selectedIds.has(j.id));
    const all = paged.length > 0 && paged.every((j) => selectedIds.has(j.id));
    el.indeterminate = some && !all;
  }, [canManageJobs, paged, selectedIds]);

  function onSort(field: "title" | "company" | "location" | "status" | "created_at") {
    setPage(1);
    if (sortField !== field) {
      setSortField(field);
      setSortOrder("asc");
      return;
    }
    setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
  }

  function sortIcon(field: "title" | "company" | "location" | "status" | "created_at") {
    if (sortField !== field) return <ArrowDownAZ className="h-3.5 w-3.5 text-slate-400" />;
    return sortOrder === "asc" ? (
      <ArrowUpAZ className="h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ArrowDownAZ className="h-3.5 w-3.5 text-blue-600" />
    );
  }

  function formatDate(value?: string | null) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short", day: "2-digit" }).format(d);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setEmploymentTypeFilter("");
    setSortField("created_at");
    setSortOrder("desc");
    setPage(1);
  }
  function applySavedView(view: "all" | "open" | "closed" | "recent") {
    setPage(1);
    if (view === "all") {
      setStatusFilter("");
      setSortField("created_at");
      setSortOrder("desc");
      return;
    }
    if (view === "open") {
      setStatusFilter("Open");
      setSortField("created_at");
      setSortOrder("desc");
      return;
    }
    if (view === "closed") {
      setStatusFilter("Closed");
      setSortField("created_at");
      setSortOrder("desc");
      return;
    }
    setStatusFilter("");
    setSortField("created_at");
    setSortOrder("desc");
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Delete ${ids.length} job${ids.length === 1 ? "" : "s"}? Related applications and data for these jobs will be removed. This cannot be undone.`
    );
    if (!ok) return;
    setBulkDeleteBusy(true);
    try {
      await apiFetchJson<{ deleted_count?: number }>("/api/jobs/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelectedIds(new Set());
      onJobsRefresh?.();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Bulk delete failed";
      window.alert(msg);
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  function exportCsv() {
    const headers = ["Job Title", "Company", "Location", "Status", "Created At"];
    const lines = [headers.join(",")];
    for (const j of sorted) {
      const row = [
        j.title || "",
        j.company || "",
        j.location || "",
        j.status || "",
        formatDate(j.created_at),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(row.join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobs-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildJobRowActions(job: Job): RowActionItem[] {
    return [
      { type: "link", label: "View detail", href: `/jobs/${job.id}` },
      {
        type: "button",
        label: "JD & skill matches",
        onClick: () => setMatchHubJob(job),
      },
      {
        type: "button",
        label: "Interview questions",
        onClick: async () => {
          setQuestionsOpen(true);
          setQuestionsJob(job);
          setQuestionsLoading(true);
          try {
            const res = await apiFetchJson<{ questions: JobQuestion[] }>(`/api/jobs/${job.id}/interview-questions`);
            setQuestions(res.questions || []);
          } catch {
            setQuestions([]);
          } finally {
            setQuestionsLoading(false);
          }
        },
      },
      {
        type: "button",
        label: "Send JD",
        onClick: () => {
          setSendJdJob(job);
          setSendJdOpen(true);
          setSendJdEmails("");
          setSendJdSubject(`Job Opportunity - ${job.title}`);
          setSendJdMessage("");
          setSendJdError(null);
          setSendJdSuccess(null);
          setSendJdConfirmed(false);
        },
      },
      { type: "button", label: "Edit", onClick: () => onEdit(job) },
      {
        type: "button",
        label: "Delete",
        danger: true,
        onClick: () => {
          void onDelete(job);
        },
      },
    ];
  }

  if (!jobs.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-md text-center space-y-4">
          <svg
            viewBox="0 0 200 120"
            className="mx-auto h-28 w-auto text-slate-200 dark:text-slate-700"
            aria-hidden="true"
          >
            <rect x="20" y="24" width="160" height="76" rx="14" className="fill-current" />
            <rect x="42" y="44" width="116" height="10" rx="5" className="fill-white/60" />
            <rect x="42" y="62" width="76" height="10" rx="5" className="fill-white/60" />
            <circle cx="156" cy="67" r="10" className="fill-white/60" />
          </svg>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">No jobs yet</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Create your first role to start tracking candidates and your pipeline.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DispositionReasonModal
        open={jobDisposition !== null}
        reasonSet="job_close"
        title="Job status change"
        description={`Select why this job is moving to “${jobDisposition?.nextStatus ?? ""}”. Required for audit.`}
        confirmLabel="Update status"
        onClose={() => setJobDisposition(null)}
        onConfirm={async (reasonId) => {
          if (!jobDisposition) return;
          try {
            await apiFetchJson(`/api/jobs/${jobDisposition.job.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: jobDisposition.nextStatus,
                disposition_reason_id: reasonId,
              }),
            });
            setJobDisposition(null);
            onJobsRefresh?.();
          } catch (e) {
            console.error(e);
          }
        }}
      />
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applySavedView("all")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                !hasCustomView ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
              ].join(" ")}
            >
              All Jobs
            </button>
            <button
              type="button"
              onClick={() => applySavedView("open")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                statusFilter === "Open" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
              ].join(" ")}
            >
              Open Jobs
            </button>
            <button
              type="button"
              onClick={() => applySavedView("closed")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                statusFilter === "Closed" ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
              ].join(" ")}
            >
              Closed Jobs
            </button>
            <button
              type="button"
              onClick={() => applySavedView("recent")}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Recently Added
            </button>
          </div>
          <div className="relative">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                type="button"
                onClick={() => setShowColumns((p) => !p)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Columns
              </button>
            </div>
            {showColumns ? (
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-600 dark:bg-slate-900">
                {(
                  [
                    ["title", "Job Title"],
                    ["company", "Company"],
                    ["location", "Location"],
                    ["openPositions", "Open Positions"],
                    ["employmentType", "Employment Type"],
                    ["status", "Status"],
                    ["createdAt", "Created At"],
                    ["actions", "Actions"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={columns[key]}
                      onChange={(e) => setColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {canManageJobs && sorted.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(sorted.map((j) => j.id)))}
              className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
            >
              Select all {sorted.length} in current view
            </button>
            {selectedIds.size > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="font-semibold text-slate-600 hover:underline dark:text-slate-300"
              >
                Clear selection ({selectedIds.size})
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-full max-w-3xl flex-wrap items-center gap-3">
            <div className="relative w-full min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search jobs by title, company, location..."
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <select
              value={employmentTypeFilter}
              onChange={(e) => {
                setEmploymentTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">All Employment Types</option>
              <option value="Full Time">Full Time</option>
              <option value="Part Time">Part Time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
              <option value="Freelance">Freelance</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "" | "Open" | "Closed");
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">All Status</option>
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
            </select>
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Total: {filtered.length}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Open: {openCount}
            </span>
            <span className="rounded-full bg-slate-200 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              Closed: {closedCount}
            </span>
          </div>
        </div>
      </div>

      <div className={`${UI.enterprise.elevatedCard} overflow-hidden shadow-sm`}>
        {canManageJobs && selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 dark:border-rose-900/50 dark:bg-rose-950/40">
            <span className="text-sm font-semibold text-rose-900 dark:text-rose-100">
              {selectedIds.size} job{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-100 dark:hover:bg-rose-950"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={bulkDeleteBusy}
                onClick={() => void handleBulkDelete()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {bulkDeleteBusy ? (
                  "Deleting…"
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
        <div className="max-h-[72vh] overflow-y-auto">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900">
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {canManageJobs ? (
                  <th className={[headerCellClass, "w-10"].join(" ")}>
                    <input
                      ref={pageSelectAllRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      checked={paged.length > 0 && paged.every((j) => selectedIds.has(j.id))}
                      onChange={() => {
                        const allOnPage = paged.every((j) => selectedIds.has(j.id));
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (allOnPage) {
                            for (const j of paged) next.delete(j.id);
                          } else {
                            for (const j of paged) next.add(j.id);
                          }
                          return next;
                        });
                      }}
                      title="Select all on this page"
                      aria-label="Select all jobs on this page"
                    />
                  </th>
                ) : null}
                {columns.title ? <th className={headerCellClass}>
                  <button type="button" onClick={() => onSort("title")} className="inline-flex items-center gap-1">
                    Job Title {sortIcon("title")}
                  </button>
                </th> : null}
                {columns.company ? <th className={headerCellClass}>
                  <button type="button" onClick={() => onSort("company")} className="inline-flex items-center gap-1">
                    Company {sortIcon("company")}
                  </button>
                </th> : null}
                {columns.location ? <th className={headerCellClass}>
                  <button type="button" onClick={() => onSort("location")} className="inline-flex items-center gap-1">
                    Location {sortIcon("location")}
                  </button>
                </th> : null}
                {columns.openPositions ? <th className={headerCellClass}>Open Positions</th> : null}
                {columns.employmentType ? <th className={headerCellClass}>Employment Type</th> : null}
                {columns.status ? <th className={headerCellClass}>
                  <button type="button" onClick={() => onSort("status")} className="inline-flex items-center gap-1">
                    Status {sortIcon("status")}
                  </button>
                </th> : null}
                {columns.createdAt ? <th className={headerCellClass}>
                  <button type="button" onClick={() => onSort("created_at")} className="inline-flex items-center gap-1">
                    Created At {sortIcon("created_at")}
                  </button>
                </th> : null}
                {columns.actions ? <th className={[headerCellClass, "text-right"].join(" ")}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {paged.map((job) => (
                <tr key={job.id} className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  {canManageJobs ? (
                    <td className={[rowCellClass, "w-10"].join(" ")} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                        checked={selectedIds.has(job.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(job.id)) next.delete(job.id);
                            else next.add(job.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${job.title}`}
                      />
                    </td>
                  ) : null}
                  {columns.title ? (
                    <td className={[rowCellClass, "font-medium text-slate-900 dark:text-slate-100"].join(" ")}>
                      <button
                        type="button"
                        onClick={() => _onView(job)}
                        className="text-left font-semibold text-blue-700 hover:underline dark:text-blue-400"
                        title="View job details"
                      >
                        {job.title}
                      </button>
                    </td>
                  ) : null}
                  {columns.company ? <td className={[rowCellClass, "text-slate-700 dark:text-slate-300"].join(" ")}>{job.company}</td> : null}
                  {columns.location ? <td className={[rowCellClass, "text-slate-700 dark:text-slate-300"].join(" ")}>{job.location}</td> : null}
                  {columns.openPositions ? <td className={[rowCellClass, "text-slate-700 dark:text-slate-300"].join(" ")}>{job.open_positions ?? 1}</td> : null}
                  {columns.employmentType ? (
                    <td className={rowCellClass}>
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                          String(job.employment_type || "Full Time") === "Full Time"
                            ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800"
                            : String(job.employment_type || "") === "Contract"
                              ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800"
                              : "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600",
                        ].join(" ")}
                      >
                        {job.employment_type || "Full Time"}
                      </span>
                    </td>
                  ) : null}
                  {columns.status ? (
                    <td className={rowCellClass} onClick={(e) => e.stopPropagation()}>
                      <div className="relative z-20 flex flex-wrap items-center gap-2">
                        <StatusBadge status={job.status || "Open"} />
                        <select
                          value={normalizeRequisitionStep(job.status)}
                          onChange={async (e) => {
                            const v = e.target.value;
                            if (jobStatusRequiresDispositionReason(v)) {
                              setJobDisposition({ job, nextStatus: v });
                              return;
                            }
                            try {
                              await apiFetchJson(`/api/jobs/${job.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: v }),
                              });
                              onJobsRefresh?.();
                            } catch {
                              // eslint-disable-next-line no-console
                              console.error("Failed to update job status");
                            }
                          }}
                          className="min-w-[148px] max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm [color-scheme:light] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
                        >
                          {REQUISITION_WORKFLOW_STEPS.map((step) => (
                            <option key={step} value={step}>
                              {step}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  ) : null}
                  {columns.createdAt ? <td className={[rowCellClass, "text-slate-700 dark:text-slate-300"].join(" ")}>{formatDate(job.created_at)}</td> : null}
                  {columns.actions ? (
                    <td className={rowCellClass} onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <RowActionsMenu items={buildJobRowActions(job)} ariaLabel={`Actions for ${job.title}`} />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(
                      1,
                      Object.values(columns).filter(Boolean).length + (canManageJobs ? 1 : 0)
                    )}
                    className="px-6 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    No jobs found for the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 dark:border-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Showing {paged.length} of {sorted.length} jobs
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 px-3 py-1 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Prev
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {Math.min(page, totalPages)} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1 text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      {sendJdOpen && sendJdJob ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSendJdOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Send JD</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{sendJdJob.title} — {sendJdJob.company}</div>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Recipient Emails</label>
                  <input className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" placeholder="a@x.com, b@y.com" value={sendJdEmails} onChange={(e) => setSendJdEmails(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Subject</label>
                  <input className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={sendJdSubject} onChange={(e) => setSendJdSubject(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Message</label>
                  <textarea className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm min-h-[120px] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={sendJdMessage} onChange={(e) => setSendJdMessage(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={sendJdConfirmed}
                    onChange={(e) => setSendJdConfirmed(e.target.checked)}
                    disabled={sendJdBusy}
                  />
                  Send this email to the candidate
                </label>
              </div>
              {sendJdError ? <div className="mt-3 text-sm text-rose-600">{sendJdError}</div> : null}
              {sendJdSuccess ? <div className="mt-3 text-sm text-emerald-700">{sendJdSuccess}</div> : null}
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-600 dark:text-slate-300" onClick={() => setSendJdOpen(false)}>Cancel</button>
                <button
                  className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={sendJdBusy || !sendJdConfirmed}
                  onClick={async () => {
                    setSendJdError(null);
                    setSendJdSuccess(null);
                    if (!sendJdEmails.trim()) {
                      setSendJdError("Email is required");
                      return;
                    }
                    setSendJdBusy(true);
                    try {
                      const res = await apiFetchJson<{ sent: number; attempted: number }>(`/api/jobs/${sendJdJob.id}/send-jd`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ emails: sendJdEmails, subject: sendJdSubject, message: sendJdMessage }),
                      });
                      setSendJdSuccess(`JD sent: ${res.sent}/${res.attempted}`);
                    } catch (e: any) {
                      setSendJdError(e?.message || "Failed to send JD");
                    } finally {
                      setSendJdBusy(false);
                    }
                  }}
                >
                  {sendJdBusy ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {questionsOpen && questionsJob ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setQuestionsOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Interview Questions</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{questionsJob.title}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
                    onClick={async () => {
                      setQuestionsLoading(true);
                      try {
                        const res = await apiFetchJson<{ questions: JobQuestion[] }>(`/api/jobs/${questionsJob.id}/interview-questions`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({}),
                        });
                        setQuestions(res.questions || []);
                      } finally {
                        setQuestionsLoading(false);
                      }
                    }}
                  >
                    Generate (AI)
                  </button>
                  <button className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-600 dark:text-slate-300" onClick={() => setQuestionsOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
              <div className="mt-3 max-h-[60vh] overflow-y-auto space-y-3">
                {questionsLoading ? <div className="text-sm text-slate-500 dark:text-slate-400">Loading...</div> : null}
                {(["technical", "scenario", "behavioral", "hr"] as const).map((cat) => (
                  <div key={cat} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{cat}</div>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700 dark:text-slate-300">
                      {questions.filter((q) => q.category === cat).map((q, idx) => (
                        <li key={`${cat}-${idx}`}>{q.question}</li>
                      ))}
                      {questions.filter((q) => q.category === cat).length === 0 ? <li className="list-none text-xs text-slate-500">No questions.</li> : null}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <JobMatchHubModal job={matchHubJob} open={Boolean(matchHubJob)} onClose={() => setMatchHubJob(null)} />
    </div>
  );
}
