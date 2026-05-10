"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { LayoutList } from "lucide-react";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import StatusBadge from "@/components/enterprise/StatusBadge";
import { UI } from "@/lib/ui";
type ActivityRow = {
  id: string;
  activity: string;
  type: string;
  candidate: string;
  job: string;
  recruiter: string;
  date: string;
  priority: "High" | "Medium" | "Low";
  link: string | null;
};

function priorityBadge(p: ActivityRow["priority"]) {
  if (p === "High") return <span className="text-xs font-semibold text-red-700 dark:text-red-400">{p}</span>;
  if (p === "Medium") return <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{p}</span>;
  return <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{p}</span>;
}

function ActivitySkeleton() {
  return (
    <div className={`${UI.enterprise.elevatedCard} p-6`}>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}

export default function ActivityCenterPage() {
  const { data, error, isLoading, mutate } = useSWR<{ activities: ActivityRow[] }>("/api/activity-center");
  const rows = data?.activities ?? [];

  return (
    <AccessGate permissionKey="dashboard.view">
      <ModulePageFrame
        title="Activity Center"
        subtitle="Live queue: alerts, screening, interview follow-ups, and empty jobs."
        metrics={
          error ? (
            <span className="text-red-600 dark:text-red-400">{(error as Error).message}</span>
          ) : isLoading ? (
            <span>Loading…</span>
          ) : (
            <span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{rows.length}</span> items
            </span>
          )
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void mutate()} className={UI.secondaryButton + " py-2 text-xs"}>
              Refresh
            </button>
            <Link href="/pipeline" className={UI.secondaryButton + " py-2 text-xs"}>
              Open pipeline
            </Link>
          </div>
        }
      >
        {error && rows.length === 0 ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-center shadow-sm dark:border-rose-900 dark:bg-rose-950/40">
            <div className="text-base font-semibold text-rose-900 dark:text-rose-100">Unable to load activity feed</div>
            <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{(error as Error).message}</p>
            <button type="button" className={UI.secondaryButton + " mt-4 py-2 text-xs"} onClick={() => void mutate()}>
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <ActivitySkeleton />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-600 dark:bg-slate-900/50">
            <LayoutList className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <div className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">You&apos;re all caught up</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">No actionable items right now.</div>
          </div>
        ) : (
          <div className={`${UI.enterprise.elevatedCard} overflow-hidden`}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <LayoutList className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Work queue
              </span>
            </div>
            <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[900px] text-sm lg:min-w-full">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-[var(--enterprise-table-border)] bg-[var(--enterprise-table-header)] dark:bg-slate-900/98">
                    {["Activity", "Type", "Candidate", "Job", "Owner", "When", "Priority"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={UI.enterprise.tableRow}>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {row.link ? (
                          <Link href={row.link} className="text-blue-700 hover:underline dark:text-blue-400">
                            {row.activity}
                          </Link>
                        ) : (
                          row.activity
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={row.type} />
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{row.candidate}</td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{row.job}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{row.recruiter}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{row.date}</td>
                      <td className="px-5 py-3">{priorityBadge(row.priority)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ModulePageFrame>
    </AccessGate>
  );
}
