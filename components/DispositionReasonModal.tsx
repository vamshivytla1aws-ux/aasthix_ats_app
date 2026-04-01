"use client";

import React, { useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
type ReasonRow = { id: number; code: string; label: string; category: string };

/** `application_reject` loads reject + withdraw reasons; `job_close` loads job_close only. */
export type DispositionReasonSet = "application_reject" | "job_close";

export default function DispositionReasonModal({
  open,
  title,
  description,
  reasonSet,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  reasonSet: DispositionReasonSet;
  confirmLabel?: string;
  onConfirm: (reasonId: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const [reasons, setReasons] = useState<ReasonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reasonId, setReasonId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReasonId("");
    setError(null);
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (reasonSet === "job_close") {
          const data = await apiFetchJson<{ reasons: ReasonRow[] }>("/api/disposition-reasons?category=job_close");
          if (!cancelled) setReasons(data.reasons || []);
        } else {
          const data = await apiFetchJson<{ reasons: ReasonRow[] }>("/api/disposition-reasons");
          if (!cancelled) {
            setReasons(
              (data.reasons || []).filter((r) => r.category === "reject" || r.category === "withdraw")
            );
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load reasons";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, reasonSet]);

  async function submit() {
    const id = Number(reasonId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Select a reason.");
      return;
    }
    setError(null);
    await onConfirm(id);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disposition-modal-title"
        >
          <h2 id="disposition-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p> : null}
          {loading ? <p className="mt-4 text-sm text-slate-500">Loading reasons…</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {!loading && reasons.length > 0 ? (
            <select
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
            >
              <option value="">Select a reason…</option>
              {reasons.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.label}
                </option>
              ))}
            </select>
          ) : null}
          {!loading && reasons.length === 0 && !error ? (
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
              No disposition reasons found. Run migration <code className="text-xs">0038_disposition_audit.sql</code>.
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={UI.secondaryButton + " py-2 text-sm"}>
              Cancel
            </button>
            <button
              type="button"
              disabled={loading || !reasonId}
              onClick={() => void submit()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
