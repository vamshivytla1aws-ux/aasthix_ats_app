"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SlidersHorizontal } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import StatusBadge from "@/components/enterprise/StatusBadge";
import RowActionsMenu, { type RowActionItem } from "@/components/enterprise/RowActionsMenu";
import FilterDrawer from "@/components/enterprise/FilterDrawer";
import Toast from "@/components/Toast";

type AlertRow = {
  id: number;
  type: string;
  message: string;
  created_at: string;
  status: "unread" | "read" | "expired";
  expires_at: string | null;
  application_id?: number | null;
  candidate_id?: number | null;
};

function buildAlertActions(
  row: AlertRow,
  onMarkRead: (id: number) => void
): RowActionItem[] {
  const items: RowActionItem[] = [];

  if (row.candidate_id != null && row.candidate_id > 0) {
    items.push({
      type: "link",
      label: "Candidate profile",
      href: `/candidates/${row.candidate_id}`,
    });
  }

  if (row.application_id != null && row.application_id > 0) {
    items.push({
      type: "link",
      label: "Open in pipeline",
      href: `/pipeline?application=${row.application_id}`,
    });
  }

  if (row.status === "unread") {
    items.push({
      type: "button",
      label: "Mark read",
      onClick: () => onMarkRead(row.id),
    });
  }

  if (items.length === 0) {
    items.push({
      type: "link",
      label: "Open alerts",
      href: "/alerts",
    });
  }

  return items;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function AlertsPage() {
  const [status, setStatus] = useState<"all" | "unread" | "read" | "expired">("all");
  const [type, setType] = useState<"all" | "ongoing" | "upcoming" | "careers_apply" | "interview_complete" | "renewal">("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filterDrawer, setFilterDrawer] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  const listKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (type !== "all") params.set("type", type);
    if (debouncedQ) params.set("q", debouncedQ);
    params.set("limit", "100");
    return `/api/alerts?${params.toString()}`;
  }, [status, type, debouncedQ]);

  const { data, error, isLoading, mutate } = useSWR<{ alerts: AlertRow[]; unreadCount: number }>(listKey);

  const rows = useMemo(() => {
    const raw = data?.alerts || [];
    return raw.map((r) => ({
      ...r,
      id: num(r.id) ?? 0,
      candidate_id: num(r.candidate_id),
      application_id: num(r.application_id),
    }));
  }, [data]);

  const unreadIds = useMemo(() => rows.filter((r) => r.status === "unread").map((r) => r.id), [rows]);

  async function markRead(id: number) {
    try {
      await apiFetchJson("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      void mutate();
      setToast({ message: "Alert marked as read.", variant: "success" });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 403
        ? `${e.message} — alerts.manage is required.`
        : (e as Error)?.message || "Update failed";
      setToast({ message: msg, variant: "error" });
    }
  }

  async function markVisibleRead() {
    if (unreadIds.length === 0) return;
    try {
      await apiFetchJson("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
      void mutate();
      setToast({ message: `${unreadIds.length} alert(s) marked as read.`, variant: "success" });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 403
        ? `${e.message} — alerts.manage is required.`
        : (e as Error)?.message || "Bulk update failed";
      setToast({ message: msg, variant: "error" });
    }
  }

  return (
    <AccessGate permissionKey="alerts.view">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={3500} /> : null}
      <FilterDrawer open={filterDrawer} onClose={() => setFilterDrawer(false)} title="Alert filters" onApply={() => setFilterDrawer(false)}>
        <p className="text-sm text-slate-600 dark:text-slate-400">Saved views and routing rules can live here next.</p>
      </FilterDrawer>

      <ModulePageFrame
        title="Alerts"
        subtitle="Interview reminders, careers applications, and renewal signals."
        metrics={
          error ? (
            <span className="text-red-600">{(error as Error).message}</span>
          ) : isLoading ? (
            <span>Loading…</span>
          ) : (
            <span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{data?.unreadCount ?? 0}</span> unread
            </span>
          )
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilterDrawer(true)} className={UI.secondaryButton + " py-2 text-xs"}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More filters
            </button>
            <button type="button" onClick={() => void mutate()} className={UI.secondaryButton + " py-2 text-xs"}>
              Refresh
            </button>
          </div>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search alerts…"
              className="w-full min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:min-w-[220px] dark:border-slate-600 dark:bg-slate-950/50 dark:text-slate-100"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm sm:w-auto dark:border-slate-600 dark:bg-slate-950/50 dark:text-slate-100"
            >
              <option value="all">All status</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="expired">Expired</option>
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm sm:w-auto dark:border-slate-600 dark:bg-slate-950/50 dark:text-slate-100"
            >
              <option value="all">All types</option>
              <option value="ongoing">Ongoing</option>
              <option value="upcoming">Upcoming</option>
              <option value="interview_complete">Interview complete</option>
              <option value="careers_apply">Careers apply</option>
              <option value="renewal">Renewal</option>
            </select>
            <button
              type="button"
              onClick={() => void markVisibleRead()}
              disabled={unreadIds.length === 0}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-gray-50 disabled:opacity-50 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              Mark visible read
            </button>
          </div>
        }
      >
        {error && rows.length === 0 ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-center shadow-sm dark:border-rose-900 dark:bg-rose-950/40">
            <div className="text-base font-semibold text-rose-900 dark:text-rose-100">Unable to load alerts</div>
            <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{(error as Error).message}</p>
            <button type="button" className={UI.secondaryButton + " mt-4 py-2 text-xs"} onClick={() => void mutate()}>
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className={`${UI.enterprise.elevatedCard} p-6`}>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-600 dark:bg-slate-900/50">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">No alerts found</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Try changing filters or check back later.</div>
          </div>
        ) : (
          <div className={`${UI.enterprise.elevatedCard} overflow-hidden`}>
            <div className="max-h-[calc(100vh-320px)] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[960px] text-sm lg:min-w-full">
                <thead className="sticky top-0 z-10 bg-[var(--enterprise-table-header)] dark:bg-slate-900/98">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="min-w-[320px] px-4 py-3">Message</th>
                    <th className="min-w-[120px] px-4 py-3">Type</th>
                    <th className="min-w-[110px] px-4 py-3">Status</th>
                    <th className="min-w-[150px] px-4 py-3">Created</th>
                    <th className="min-w-[150px] px-4 py-3">Expires</th>
                    <th className="min-w-[90px] px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {rows.map((r) => (
                    <tr key={r.id} className={UI.enterprise.tableRow}>
                      <td className="px-4 py-3 break-words text-slate-900 dark:text-slate-100">
                        <span>{r.message}</span>
                        {r.candidate_id != null && r.candidate_id > 0 ? (
                          <>
                            {" "}
                            <Link
                              href={`/candidates/${r.candidate_id}`}
                              className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                            >
                              Profile
                            </Link>
                          </>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.type} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{fmt(r.created_at)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.expires_at ? fmt(r.expires_at) : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <RowActionsMenu
                          ariaLabel="Alert actions"
                          items={buildAlertActions(r, (id) => {
                            void markRead(id);
                          })}
                        />
                      </td>
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
