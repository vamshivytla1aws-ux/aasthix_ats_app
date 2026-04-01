"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import ModuleDataTable, { type ModuleDataTableColumn } from "@/components/enterprise/ModuleDataTable";
import StatusBadge from "@/components/enterprise/StatusBadge";
import Toast from "@/components/Toast";

type Reason = {
  id: number;
  code: string;
  label: string;
  category: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

const CATEGORIES = ["reject", "withdraw", "job_close"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  reject: "Reject",
  withdraw: "Withdraw",
  job_close: "Job close",
};

export default function DispositionReasonsAdmin() {
  const { density } = useDensity("ats:admin-reasons-density", "compact");
  const { data, error, isLoading, mutate } = useSWR<{ reasons: Reason[] }>(
    "/api/admin/disposition-reasons",
    dashboardFetcher
  );

  const reasons = data?.reasons ?? [];

  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ code: "", label: "", category: "reject" as string, sort_order: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSort, setEditSort] = useState("");

  function showToast(message: string, variant: "success" | "error") {
    setToast({ message, variant });
  }

  function handleApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError && e.status === 403) {
      showToast(`${e.message}`, "error");
    } else {
      showToast((e as Error)?.message || fallback, "error");
    }
  }

  const toggleActive = useCallback(
    async (reason: Reason) => {
      setBusyId(reason.id);
      try {
        await apiFetchJson("/api/admin/disposition-reasons", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: reason.id, active: !reason.active }),
        });
        showToast(
          `"${reason.label}" ${reason.active ? "deactivated" : "activated"}.`,
          "success"
        );
        void mutate();
      } catch (e) {
        handleApiError(e, "Toggle failed");
      } finally {
        setBusyId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate]
  );

  const saveEdit = useCallback(
    async (id: number) => {
      setBusyId(id);
      try {
        const body: Record<string, unknown> = { id };
        if (editLabel.trim()) body.label = editLabel.trim();
        const sortNum = Number(editSort);
        if (editSort.trim() && Number.isFinite(sortNum)) body.sort_order = sortNum;
        await apiFetchJson("/api/admin/disposition-reasons", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        showToast("Reason updated.", "success");
        setEditingId(null);
        void mutate();
      } catch (e) {
        handleApiError(e, "Update failed");
      } finally {
        setBusyId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editLabel, editSort, mutate]
  );

  const addReason = useCallback(async () => {
    setAddBusy(true);
    try {
      const sortNum = Number(addForm.sort_order);
      await apiFetchJson("/api/admin/disposition-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: addForm.code.trim(),
          label: addForm.label.trim(),
          category: addForm.category,
          sort_order: Number.isFinite(sortNum) ? sortNum : undefined,
        }),
      });
      showToast(`Reason "${addForm.label.trim()}" created.`, "success");
      setAddForm({ code: "", label: "", category: "reject", sort_order: "" });
      setShowAdd(false);
      void mutate();
    } catch (e) {
      handleApiError(e, "Create failed");
    } finally {
      setAddBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addForm, mutate]);

  const columns: ModuleDataTableColumn<Reason>[] = useMemo(
    () => [
      {
        id: "code",
        header: "Code",
        csvValue: (r) => r.code,
        sortValue: (r) => r.code,
        cell: (r) => (
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {r.code}
          </code>
        ),
      },
      {
        id: "label",
        header: "Label",
        csvValue: (r) => r.label,
        sortValue: (r) => r.label,
        cell: (r) => {
          if (editingId === r.id) {
            return (
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="w-full rounded border border-blue-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-blue-600 dark:bg-slate-900 dark:text-slate-200"
                autoFocus
              />
            );
          }
          return <span className="text-sm text-slate-800 dark:text-slate-200">{r.label}</span>;
        },
      },
      {
        id: "category",
        header: "Category",
        csvValue: (r) => r.category,
        sortValue: (r) => r.category,
        cell: (r) => (
          <StatusBadge status={CATEGORY_LABELS[r.category] ?? r.category} />
        ),
      },
      {
        id: "sort_order",
        header: "Sort",
        csvValue: (r) => String(r.sort_order),
        sortValue: (r) => r.sort_order,
        align: "right",
        cell: (r) => {
          if (editingId === r.id) {
            return (
              <input
                type="number"
                value={editSort}
                onChange={(e) => setEditSort(e.target.value)}
                className="w-16 rounded border border-blue-300 bg-white px-2 py-1 text-right text-sm text-slate-800 dark:border-blue-600 dark:bg-slate-900 dark:text-slate-200"
              />
            );
          }
          return <span className="text-xs text-slate-500 dark:text-slate-400">{r.sort_order}</span>;
        },
      },
      {
        id: "active",
        header: "Active",
        csvValue: (r) => (r.active ? "Yes" : "No"),
        sortValue: (r) => (r.active ? 1 : 0),
        cell: (r) => (
          <button
            type="button"
            disabled={busyId === r.id}
            onClick={() => void toggleActive(r)}
            className={[
              "rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ring-inset transition",
              r.active
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800"
                : "bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600",
              busyId === r.id ? "opacity-50" : "",
            ].join(" ")}
          >
            {r.active ? "Active" : "Inactive"}
          </button>
        ),
      },
      {
        id: "actions",
        header: "",
        csvValue: () => "",
        defaultVisible: true,
        cell: (r) => {
          if (editingId === r.id) {
            return (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void saveEdit(r.id)}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
                >
                  Cancel
                </button>
              </div>
            );
          }
          return (
            <button
              type="button"
              onClick={() => {
                setEditingId(r.id);
                setEditLabel(r.label);
                setEditSort(String(r.sort_order));
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
            >
              Edit
            </button>
          );
        },
      },
    ],
    [busyId, editingId, editLabel, editSort, saveEdit, toggleActive]
  );

  const loadError = error ? (error as Error).message : null;
  const skeleton = isLoading && reasons.length === 0;

  const activeCt = reasons.filter((r) => r.active).length;
  const inactiveCt = reasons.length - activeCt;

  return (
    <>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={3500} />
      ) : null}

      <ModulePageFrame
        title="Disposition reasons"
        subtitle="Manage structured reasons for reject, withdraw, and job-close actions. Public API returns active reasons only."
        metrics={
          loadError ? (
            <span className="text-red-600 dark:text-red-400">{loadError}</span>
          ) : skeleton ? (
            <span className="text-slate-500">Loading…</span>
          ) : (
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{reasons.length}</span>
                <span className="text-slate-500 dark:text-slate-400"> total</span>
              </span>
              <span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">{activeCt}</span>
                <span className="text-slate-500 dark:text-slate-400"> active</span>
              </span>
              <span>
                <span className="font-semibold text-slate-500 dark:text-slate-400">{inactiveCt}</span>
                <span className="text-slate-500 dark:text-slate-400"> inactive</span>
              </span>
            </span>
          )
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className={UI.primaryButton + " py-2 text-xs"}
            >
              <Plus className="h-3.5 w-3.5" />
              Add reason
            </button>
            <button
              type="button"
              onClick={() => void mutate()}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              Refresh
            </button>
            <Link href="/admin/permissions" className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}>
              Access control
            </Link>
            <Link href="/audit" className={UI.secondaryButton + " inline-flex items-center py-2 text-xs"}>
              Audit trail
            </Link>
          </div>
        }
      >
        {/* Add reason form */}
        {showAdd && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-800 dark:bg-blue-950/30">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">New disposition reason</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Code</label>
                <input
                  type="text"
                  value={addForm.code}
                  onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                  placeholder="e.g. reject_timeline"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Label</label>
                <input
                  type="text"
                  value={addForm.label}
                  onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Human-readable label"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Category</label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Sort order</label>
                <input
                  type="number"
                  value={addForm.sort_order}
                  onChange={(e) => setAddForm((f) => ({ ...f, sort_order: e.target.value }))}
                  placeholder="500"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-right text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={addBusy || !addForm.code.trim() || !addForm.label.trim()}
                onClick={() => void addReason()}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {addBusy ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {skeleton ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          </div>
        ) : loadError && reasons.length === 0 ? (
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
            rows={reasons}
            rowKey={(r) => r.id}
            columns={columns}
            storageKey="ats:admin-reasons-columns"
            density={density}
            exportBasename="disposition-reasons"
            maxBodyHeight="min(68vh, 680px)"
            emptyMessage={
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  No disposition reasons configured
                </div>
                <p className="mt-1">Run migration 0038_disposition_audit.sql to seed defaults, or add custom reasons above.</p>
              </div>
            }
          />
        )}
      </ModulePageFrame>
    </>
  );
}
