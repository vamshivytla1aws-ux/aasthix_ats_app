"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import ModuleDataTable, { type ModuleDataTableColumn } from "@/components/enterprise/ModuleDataTable";
import StatusBadge from "@/components/enterprise/StatusBadge";

type RecruiterRow = {
  user_id: number;
  email: string;
  full_name: string;
  assigned_jds: number;
  active_jds: number;
  total_applications: number;
  applied: number;
  screening: number;
  interview: number;
  selected: number;
  rejected: number;
  interviews_this_week: number;
  last_activity_at: string | null;
};

type RecruiterJobRow = {
  job_id: number;
  title: string;
  company: string;
  status: string;
  total_applications: number;
  applied: number;
  screening: number;
  interview: number;
  selected: number;
  rejected: number;
  last_activity_at: string | null;
  team_role: string;
};

const ROLE_LABELS: Record<string, string> = {
  hiring_manager: "HM",
  recruiter: "Rec",
  coordinator: "Coord",
  sourcer: "Src",
  observer: "Obs",
  owner: "Owner",
  assigned: "Assigned",
};

export default function RecruiterWorkloadPage() {
  const { density } = useDensity("ats:workload-density", "compact");
  const { data, error, isLoading, mutate } = useSWR<{ recruiters: RecruiterRow[] }>(
    "/api/recruiter/workload",
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );

  const recruiters = data?.recruiters ?? [];
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  const { data: drillData, isLoading: drillLoading } = useSWR<{ jobs: RecruiterJobRow[] }>(
    expandedUserId ? `/api/recruiter/workload?user_id=${expandedUserId}` : null,
    dashboardFetcher
  );
  const drillJobs = drillData?.jobs ?? [];

  const columns: ModuleDataTableColumn<RecruiterRow>[] = useMemo(
    () => [
      {
        id: "recruiter",
        header: "Recruiter",
        csvValue: (r) => r.full_name || r.email,
        sortValue: (r) => r.full_name || r.email,
        cell: (r) => (
          <button
            type="button"
            onClick={() => setExpandedUserId((prev) => (prev === r.user_id ? null : r.user_id))}
            className="text-left"
          >
            <div className="font-semibold text-blue-700 hover:underline dark:text-blue-400">
              {r.full_name || r.email}
            </div>
            <div className="text-[11px] text-slate-400">{r.email}</div>
          </button>
        ),
      },
      {
        id: "assigned",
        header: "JDs",
        csvValue: (r) => String(r.assigned_jds),
        sortValue: (r) => r.assigned_jds,
        align: "right",
        cell: (r) => <span className="font-semibold text-slate-800 dark:text-slate-200">{r.assigned_jds}</span>,
      },
      {
        id: "active",
        header: "Active",
        csvValue: (r) => String(r.active_jds),
        sortValue: (r) => r.active_jds,
        align: "right",
        cell: (r) => <span className="font-semibold text-emerald-700 dark:text-emerald-300">{r.active_jds}</span>,
      },
      {
        id: "apps",
        header: "Apps",
        csvValue: (r) => String(r.total_applications),
        sortValue: (r) => r.total_applications,
        align: "right",
        cell: (r) => r.total_applications,
      },
      {
        id: "screening",
        header: "Screening",
        csvValue: (r) => String(r.screening),
        sortValue: (r) => r.screening,
        align: "right",
        cell: (r) => <span className="text-amber-700 dark:text-amber-300">{r.screening}</span>,
      },
      {
        id: "interview",
        header: "Interview",
        csvValue: (r) => String(r.interview),
        sortValue: (r) => r.interview,
        align: "right",
        cell: (r) => <span className="text-sky-700 dark:text-sky-300">{r.interview}</span>,
      },
      {
        id: "selected",
        header: "Selected",
        csvValue: (r) => String(r.selected),
        sortValue: (r) => r.selected,
        align: "right",
        cell: (r) => <span className="text-emerald-700 dark:text-emerald-300">{r.selected}</span>,
      },
      {
        id: "interviews_week",
        header: "Int. this week",
        csvValue: (r) => String(r.interviews_this_week),
        sortValue: (r) => r.interviews_this_week,
        align: "right",
        cell: (r) => (
          <span className={r.interviews_this_week > 0 ? "font-semibold text-blue-700 dark:text-blue-300" : "text-slate-400"}>
            {r.interviews_this_week}
          </span>
        ),
      },
      {
        id: "last_active",
        header: "Last active",
        csvValue: (r) => r.last_activity_at ?? "",
        sortValue: (r) => r.last_activity_at ?? "",
        cell: (r) =>
          r.last_activity_at ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(r.last_activity_at)}</span>
          ) : (
            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
          ),
      },
    ],
    []
  );

  const drillColumns: ModuleDataTableColumn<RecruiterJobRow>[] = useMemo(
    () => [
      {
        id: "title",
        header: "JD / Requirement",
        csvValue: (r) => r.title,
        sortValue: (r) => r.title,
        cell: (r) => (
          <Link href={`/jobs/${r.job_id}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-400">
            {r.title}
            <span className="ml-1 text-xs text-slate-400">#{r.job_id}</span>
          </Link>
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
        id: "status",
        header: "Status",
        csvValue: (r) => r.status,
        sortValue: (r) => r.status,
        cell: (r) => <StatusBadge status={r.status || "Open"} />,
      },
      {
        id: "role",
        header: "Role",
        csvValue: (r) => r.team_role,
        sortValue: (r) => r.team_role,
        cell: (r) => (
          <span className="text-xs font-medium capitalize text-slate-600 dark:text-slate-300">
            {ROLE_LABELS[r.team_role] ?? r.team_role}
          </span>
        ),
      },
      {
        id: "apps",
        header: "Apps",
        csvValue: (r) => String(r.total_applications),
        sortValue: (r) => r.total_applications,
        align: "right",
        cell: (r) => r.total_applications,
      },
      {
        id: "applied",
        header: "Applied",
        csvValue: (r) => String(r.applied),
        sortValue: (r) => r.applied,
        align: "right",
        cell: (r) => r.applied,
      },
      {
        id: "screening",
        header: "Screen",
        csvValue: (r) => String(r.screening),
        sortValue: (r) => r.screening,
        align: "right",
        cell: (r) => <span className="text-amber-700 dark:text-amber-300">{r.screening}</span>,
      },
      {
        id: "interview",
        header: "Intv",
        csvValue: (r) => String(r.interview),
        sortValue: (r) => r.interview,
        align: "right",
        cell: (r) => <span className="text-sky-700 dark:text-sky-300">{r.interview}</span>,
      },
      {
        id: "selected",
        header: "Sel",
        csvValue: (r) => String(r.selected),
        sortValue: (r) => r.selected,
        align: "right",
        cell: (r) => <span className="text-emerald-700 dark:text-emerald-300">{r.selected}</span>,
      },
      {
        id: "rejected",
        header: "Rej",
        csvValue: (r) => String(r.rejected),
        sortValue: (r) => r.rejected,
        align: "right",
        cell: (r) => <span className="text-red-600 dark:text-red-400">{r.rejected}</span>,
      },
      {
        id: "last_active",
        header: "Last active",
        csvValue: (r) => r.last_activity_at ?? "",
        sortValue: (r) => r.last_activity_at ?? "",
        cell: (r) =>
          r.last_activity_at ? (
            <span className="text-xs text-slate-500">{formatDate(r.last_activity_at)}</span>
          ) : (
            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
          ),
      },
    ],
    []
  );

  const loadError = error ? (error as Error).message : null;
  const skeleton = isLoading && recruiters.length === 0;

  const totalActive = recruiters.reduce((s, r) => s + r.active_jds, 0);
  const totalApps = recruiters.reduce((s, r) => s + r.total_applications, 0);

  const expandedRecruiter = expandedUserId
    ? recruiters.find((r) => r.user_id === expandedUserId)
    : null;

  return (
    <ModulePageFrame
      title="Recruiter workload"
      subtitle="Overview of JD assignments, pipeline status, and activity per recruiter. Click a recruiter to drill into their JDs."
      metrics={
        loadError ? (
          <span className="text-red-600 dark:text-red-400">{loadError}</span>
        ) : skeleton ? (
          <span className="text-slate-500">Loading…</span>
        ) : (
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{recruiters.length}</span>
              <span className="text-slate-500 dark:text-slate-400"> recruiter{recruiters.length !== 1 ? "s" : ""}</span>
            </span>
            <span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">{totalActive}</span>
              <span className="text-slate-500 dark:text-slate-400"> active JDs</span>
            </span>
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{totalApps}</span>
              <span className="text-slate-500 dark:text-slate-400"> applications</span>
            </span>
          </span>
        )
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void mutate()} className={UI.secondaryButton + " py-2 text-xs"}>
            Refresh
          </button>
          <Link href="/jobs?view=requisition" className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}>
            Jobs workflow
          </Link>
          <Link href="/recruiter/copilot" className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}>
            Copilot
          </Link>
        </div>
      }
    >
      {skeleton ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        </div>
      ) : loadError && recruiters.length === 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/40">
          <p className="font-semibold text-rose-900 dark:text-rose-100">{loadError}</p>
          <button type="button" className={UI.secondaryButton + " mt-3 py-2 text-xs"} onClick={() => void mutate()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <ModuleDataTable
            rows={recruiters}
            rowKey={(r) => r.user_id}
            columns={columns}
            storageKey="ats:workload-columns"
            density={density}
            exportBasename="recruiter-workload"
            maxBodyHeight="min(50vh, 420px)"
            emptyMessage={
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">No recruiter data</div>
                <p className="mt-1">No users have assigned JDs yet. Assign team members from a job detail page.</p>
              </div>
            }
          />

          {/* Drill-down: recruiter's JDs */}
          {expandedUserId && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                  {expandedRecruiter?.full_name || expandedRecruiter?.email || `User #${expandedUserId}`}
                  <span className="ml-1 font-normal text-blue-600 dark:text-blue-400">— assigned JDs</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setExpandedUserId(null)}
                  className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900"
                >
                  Close
                </button>
              </div>
              {drillLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-blue-100 dark:bg-blue-900/40" />
                  ))}
                </div>
              ) : (
                <ModuleDataTable
                  rows={drillJobs}
                  rowKey={(r) => r.job_id}
                  columns={drillColumns}
                  storageKey="ats:workload-drill-columns"
                  density={density}
                  exportBasename={`workload-${expandedUserId}`}
                  maxBodyHeight="min(40vh, 360px)"
                  emptyMessage="No JDs assigned to this recruiter."
                />
              )}
            </div>
          )}
        </div>
      )}
    </ModulePageFrame>
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
