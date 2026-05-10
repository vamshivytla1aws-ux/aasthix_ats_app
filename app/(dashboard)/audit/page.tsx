"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SlidersHorizontal } from "lucide-react";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import ModuleDataTable, { type ModuleDataTableColumn } from "@/components/enterprise/ModuleDataTable";
import FilterDrawer from "@/components/enterprise/FilterDrawer";
import StatusBadge from "@/components/enterprise/StatusBadge";

type DispositionEvent = {
  id: number;
  user_id: number;
  user_email: string;
  entity_type: "application" | "job";
  entity_id: number;
  disposition_reason_id: number;
  reason_code: string;
  reason_label: string;
  reason_category: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  job_title: string | null;
  application_job_title: string | null;
  application_candidate_name: string | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZE = 50;

const CATEGORY_LABELS: Record<string, string> = {
  reject: "Reject",
  withdraw: "Withdraw",
  job_close: "Job close",
};

export default function AuditPage() {
  const { density } = useDensity("ats:audit-density", "compact");

  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [reasonCategory, setReasonCategory] = useState("");
  const [entityId, setEntityId] = useState("");
  const [debouncedEntityId, setDebouncedEntityId] = useState("");
  const [filterDrawer, setFilterDrawer] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedEntityId(entityId.trim()), 300);
    return () => window.clearTimeout(t);
  }, [entityId]);

  const buildUrl = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      if (entityType) params.set("entity_type", entityType);
      if (reasonCategory) params.set("reason_category", reasonCategory);
      if (debouncedEntityId && Number.isFinite(Number(debouncedEntityId))) {
        params.set("entity_id", debouncedEntityId);
      }
      return `/api/audit/disposition-events?${params.toString()}`;
    },
    [entityType, reasonCategory, debouncedEntityId]
  );

  const swrKey = useMemo(() => buildUrl(page), [buildUrl, page]);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<{ events: DispositionEvent[]; pagination: Pagination }>(
    swrKey,
    dashboardFetcher
  );

  const events = data?.events ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 };

  useEffect(() => {
    setPage(1);
  }, [entityType, reasonCategory, debouncedEntityId]);

  const columns: ModuleDataTableColumn<DispositionEvent>[] = useMemo(
    () => [
      {
        id: "created",
        header: "Date",
        csvValue: (r) => r.created_at,
        sortValue: (r) => r.created_at,
        cell: (r) => (
          <span className="whitespace-nowrap text-xs">
            {formatDateTime(r.created_at)}
          </span>
        ),
      },
      {
        id: "entity_type",
        header: "Entity",
        csvValue: (r) => r.entity_type,
        sortValue: (r) => r.entity_type,
        cell: (r) => (
          <StatusBadge status={r.entity_type === "job" ? "Job" : "Application"} />
        ),
      },
      {
        id: "entity_ref",
        header: "Reference",
        csvValue: (r) => {
          if (r.entity_type === "job") return r.job_title ?? `Job #${r.entity_id}`;
          return `${r.application_candidate_name ?? "?"} → ${r.application_job_title ?? `Job ?`}`;
        },
        sortValue: (r) => r.entity_id,
        cell: (r) => {
          if (r.entity_type === "job") {
            return (
              <Link
                href={`/jobs/${r.entity_id}`}
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                {r.job_title ?? `Job #${r.entity_id}`}
              </Link>
            );
          }
          return (
            <span className="text-sm">
              <span className="font-medium">{r.application_candidate_name ?? `App #${r.entity_id}`}</span>
              {r.application_job_title ? (
                <span className="text-slate-500 dark:text-slate-400"> → {r.application_job_title}</span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "category",
        header: "Category",
        csvValue: (r) => r.reason_category,
        sortValue: (r) => r.reason_category,
        cell: (r) => (
          <span className="text-xs font-medium capitalize text-slate-600 dark:text-slate-300">
            {CATEGORY_LABELS[r.reason_category] ?? r.reason_category}
          </span>
        ),
      },
      {
        id: "reason",
        header: "Reason",
        csvValue: (r) => r.reason_label,
        sortValue: (r) => r.reason_label,
        cell: (r) => (
          <span className="text-sm text-slate-800 dark:text-slate-200">{r.reason_label}</span>
        ),
      },
      {
        id: "actor",
        header: "Performed by",
        csvValue: (r) => r.user_email,
        sortValue: (r) => r.user_email,
        cell: (r) => (
          <span className="text-xs text-slate-600 dark:text-slate-400">{r.user_email}</span>
        ),
      },
      {
        id: "notes",
        header: "Notes",
        defaultVisible: true,
        csvValue: (r) => r.notes ?? "",
        cell: (r) =>
          r.notes ? (
            <span className="max-w-xs truncate text-xs text-slate-500 dark:text-slate-400" title={r.notes}>
              {r.notes}
            </span>
          ) : (
            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
          ),
      },
    ],
    []
  );

  const loadError = error ? (error as Error).message : null;
  const skeleton = isLoading && events.length === 0;

  const paginationBar = pagination.totalPages > 1 ? (
    <div className="flex items-center justify-between px-1 pt-3 text-xs text-slate-500 dark:text-slate-400">
      <span>
        Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className={UI.secondaryButton + " px-3 py-1 text-xs disabled:opacity-40"}
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={page >= pagination.totalPages}
          onClick={() => setPage((p) => p + 1)}
          className={UI.secondaryButton + " px-3 py-1 text-xs disabled:opacity-40"}
        >
          Next →
        </button>
      </div>
    </div>
  ) : pagination.total > 0 ? (
    <div className="px-1 pt-3 text-xs text-slate-400 dark:text-slate-500">
      {pagination.total} event{pagination.total !== 1 ? "s" : ""}
    </div>
  ) : null;

  return (
    <>
      <FilterDrawer
        open={filterDrawer}
        onClose={() => setFilterDrawer(false)}
        title="Audit filters"
        onApply={() => setFilterDrawer(false)}
        onReset={() => {
          setEntityType("");
          setReasonCategory("");
          setEntityId("");
          setFilterDrawer(false);
        }}
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Entity type
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">All</option>
              <option value="job">Job</option>
              <option value="application">Application</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Reason category
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
            >
              <option value="">All</option>
              <option value="reject">Reject</option>
              <option value="withdraw">Withdraw</option>
              <option value="job_close">Job close</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Entity ID
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              placeholder="Job or application ID…"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            />
          </div>
        </div>
      </FilterDrawer>

      <ModulePageFrame
        title="Disposition audit trail"
        subtitle="Read-only log of every reject, withdraw, and job-close event with structured reasons."
        metrics={
          loadError ? (
            <span className="text-red-600 dark:text-red-400">{loadError}</span>
          ) : skeleton ? (
            <span className="text-slate-500">Loading…</span>
          ) : (
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {pagination.total}
                </span>
                <span className="text-slate-500 dark:text-slate-400"> total events</span>
              </span>
              <span>
                <span className="text-slate-500 dark:text-slate-400">Page </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {pagination.page}
                </span>
                <span className="text-slate-500 dark:text-slate-400"> of {pagination.totalPages || 1}</span>
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
              onClick={() => void mutate()}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              Refresh
            </button>
            <Link
              href="/jobs?view=requisition"
              className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}
            >
              Jobs workflow
            </Link>
          </div>
        }
      >
        {skeleton ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          </div>
        ) : loadError && events.length === 0 ? (
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
          <>
            <ModuleDataTable
              rows={events}
              rowKey={(r) => r.id}
              columns={columns}
              storageKey="ats:audit-table-columns"
              density={density}
              exportBasename="disposition-audit"
              maxBodyHeight="min(68vh, 680px)"
              emptyMessage={
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    No disposition events found
                  </div>
                  <p className="mt-1">Adjust filters or check back after status changes are recorded.</p>
                </div>
              }
            />
            {paginationBar}
          </>
        )}
      </ModulePageFrame>
    </>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}
