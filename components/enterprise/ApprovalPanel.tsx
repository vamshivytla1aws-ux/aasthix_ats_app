"use client";

import React, { useCallback, useState } from "react";
import useSWR from "swr";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import StatusBadge from "./StatusBadge";

type Approval = {
  id: number;
  job_id: number;
  requester_id: number;
  approver_id: number | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  notes: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  job_title?: string;
  requester_email?: string;
  approver_email?: string;
};

type ApprovalPanelProps = {
  jobId: number;
  jobStatus: string;
  canManage: boolean;
  canApprove: boolean;
  onStatusChange?: () => void;
  onToast?: (message: string, variant: "success" | "error") => void;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function ApprovalPanel({
  jobId,
  jobStatus,
  canManage,
  canApprove,
  onStatusChange,
  onToast,
}: ApprovalPanelProps) {
  const {
    data,
    isLoading,
    mutate,
  } = useSWR<{ approvals: Approval[] }>(
    `/api/approvals?job_id=${jobId}`,
    (url: string) => apiFetchJson<{ approvals: Approval[] }>(url)
  );

  const approvals = data?.approvals ?? [];
  const pending = approvals.find((a) => a.status === "pending");
  const latest = approvals[0];

  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");

  const toast = useCallback(
    (msg: string, v: "success" | "error") => onToast?.(msg, v),
    [onToast]
  );

  const handleError = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof ApiError && e.status === 403) {
        toast(`${e.message} — permission required.`, "error");
      } else {
        toast((e as Error)?.message || fallback, "error");
      }
    },
    [toast]
  );

  const submitForApproval = useCallback(async () => {
    setBusy(true);
    try {
      await apiFetchJson("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, notes: notes.trim() || undefined }),
      });
      toast("Approval request submitted. Job moved to Pending Approval.", "success");
      setNotes("");
      void mutate();
      onStatusChange?.();
    } catch (e) {
      handleError(e, "Failed to submit approval");
    } finally {
      setBusy(false);
    }
  }, [jobId, notes, mutate, onStatusChange, toast, handleError]);

  const handleDecision = useCallback(
    async (action: "approve" | "reject" | "cancel") => {
      if (!pending) return;
      setBusy(true);
      try {
        await apiFetchJson("/api/approvals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pending.id, action, notes: notes.trim() || undefined }),
        });
        const label = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";
        toast(`Approval ${label}. Job status updated.`, "success");
        setNotes("");
        void mutate();
        onStatusChange?.();
      } catch (e) {
        handleError(e, `Failed to ${action} request`);
      } finally {
        setBusy(false);
      }
    },
    [pending, notes, mutate, onStatusChange, toast, handleError]
  );

  const isDraft = jobStatus === "Draft" || jobStatus === "" || !jobStatus;
  const isPendingApproval =
    jobStatus === "Pending Approval" ||
    jobStatus.toLowerCase().includes("pending");

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
          Approval workflow
        </h3>
        {latest && (
          <StatusBadge
            status={STATUS_LABELS[latest.status] ?? latest.status}
          />
        )}
      </div>

      {isLoading ? (
        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-indigo-100 dark:bg-indigo-900" />
      ) : (
        <>
          {/* Submit for approval (Draft) */}
          {isDraft && !pending && canManage && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-indigo-800 dark:text-indigo-300">
                Submit this job for approval to move it to &quot;Pending Approval&quot;.
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for the approver…"
                rows={2}
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 dark:border-indigo-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitForApproval()}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500"
              >
                {busy ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
          )}

          {/* Pending approval — approver actions */}
          {pending && isPendingApproval && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-indigo-800 dark:text-indigo-300">
                Submitted by{" "}
                <span className="font-semibold">{pending.requester_email ?? `User #${pending.requester_id}`}</span>
                {pending.notes ? ` — "${pending.notes}"` : ""}
              </p>
              {(canApprove || canManage) && (
                <>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Decision notes (optional)…"
                    rows={2}
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 dark:border-indigo-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDecision("approve")}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Approve → Open"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDecision("reject")}
                      className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Reject → Draft"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDecision("cancel")}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Cancel request
                    </button>
                  </div>
                </>
              )}
              {!canApprove && !canManage && (
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Awaiting approver action — you don&apos;t have the approvals.manage permission.
                </p>
              )}
            </div>
          )}

          {/* History */}
          {approvals.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-900 dark:text-indigo-400">
                Approval history ({approvals.length})
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                {approvals.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <StatusBadge status={STATUS_LABELS[a.status] ?? a.status} />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">
                        {a.requester_email ?? `#${a.requester_id}`}
                      </span>
                      {a.approver_email && (
                        <span className="text-slate-500"> → {a.approver_email}</span>
                      )}
                      {a.notes ? <span className="text-slate-500"> — {a.notes}</span> : null}
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {new Date(a.created_at).toLocaleString()}
                        {a.decided_at && ` · decided ${new Date(a.decided_at).toLocaleString()}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* No approvals and not draft */}
          {approvals.length === 0 && !isDraft && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              No approval requests recorded for this job.
            </p>
          )}
        </>
      )}
    </div>
  );
}
