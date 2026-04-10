"use client";

import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type RoundRow = {
  id?: number;
  round_key?: string;
  round_label: string;
  round_order: number;
  is_final: boolean;
};

const STAGE_KEYS = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"] as const;

export default function JobInterviewRoundsPanel({
  jobId,
  canManage,
  pipelineWipLimits,
  onSavedWip,
  onToast,
}: {
  jobId: number;
  canManage: boolean;
  pipelineWipLimits?: Record<string, number> | null;
  onSavedWip?: () => void;
  onToast?: (message: string, variant: "success" | "error") => void;
}) {
  const { data, isLoading, mutate } = useSWR<{ rounds: RoundRow[] }>(
    `/api/jobs/${jobId}/interview-rounds`,
    dashboardFetcher,
    { revalidateOnFocus: false }
  );

  const [draft, setDraft] = useState<RoundRow[] | null>(null);
  const sorted = useMemo(() => {
    const rounds = draft ?? data?.rounds ?? [];
    return [...rounds].sort((a, b) => a.round_order - b.round_order || (a.id ?? 0) - (b.id ?? 0));
  }, [draft, data?.rounds]);

  const [busy, setBusy] = useState(false);
  const [wipDraft, setWipDraft] = useState<Record<string, string>>({});

  const wipMerged = useMemo(() => {
    const base: Record<string, string> = {};
    for (const k of STAGE_KEYS) {
      const v = pipelineWipLimits?.[k];
      base[k] = v != null && Number.isFinite(v) ? String(v) : "";
    }
    return { ...base, ...wipDraft };
  }, [pipelineWipLimits, wipDraft]);

  function sameRow(a: RoundRow, b: RoundRow) {
    if (a.id != null && b.id != null) return a.id === b.id;
    return a.round_order === b.round_order && a.round_label === b.round_label;
  }

  const updateRow = useCallback(
    (displayIdx: number, patch: Partial<RoundRow>) => {
      const target = sorted[displayIdx];
      if (!target) return;
      setDraft((prev) => {
        const base = [...(prev ?? data?.rounds ?? [])];
        const at = base.findIndex((x) => sameRow(x, target));
        if (at < 0) return prev;
        base[at] = { ...base[at], ...patch };
        return base;
      });
    },
    [data?.rounds, sorted]
  );

  const addRow = useCallback(() => {
    setDraft((prev) => {
      const base = prev ?? data?.rounds ?? [];
      const maxOrder = base.reduce((m, r) => Math.max(m, r.round_order || 0), 0);
      return [
        ...base,
        {
          round_label: `Round ${maxOrder + 1}`,
          round_order: maxOrder + 1,
          is_final: false,
        },
      ];
    });
  }, [data?.rounds]);

  const removeRow = useCallback(
    (displayIdx: number) => {
      const target = sorted[displayIdx];
      if (!target) return;
      setDraft((prev) => {
        const base = prev ?? data?.rounds ?? [];
        return base.filter((x) => !sameRow(x, target));
      });
    },
    [data?.rounds, sorted]
  );

  async function saveRounds() {
    if (!canManage) return;
    setBusy(true);
    try {
      const payload = sorted.map((r, i) => ({
        id: r.id,
        round_key: r.round_key,
        round_label: r.round_label.trim() || `Round ${i + 1}`,
        round_order: r.round_order || i + 1,
        is_final: r.is_final === true,
      }));
      await apiFetchJson(`/api/jobs/${jobId}/interview-rounds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds: payload }),
      });
      setDraft(null);
      void mutate();
      onToast?.("Interview rounds saved.", "success");
    } catch (e: unknown) {
      onToast?.(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveWip() {
    if (!canManage) return;
    setBusy(true);
    try {
      const cleaned: Record<string, number> = {};
      for (const k of STAGE_KEYS) {
        const raw = wipMerged[k]?.trim();
        if (!raw) continue;
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 1) cleaned[k] = Math.min(500, Math.trunc(n));
      }
      await apiFetchJson(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_wip_limits: Object.keys(cleaned).length ? cleaned : null }),
      });
      setWipDraft({});
      onSavedWip?.();
      onToast?.("Pipeline limits saved.", "success");
    } catch (e: unknown) {
      onToast?.(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${UI.enterprise.elevatedCard} p-6`}>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Interview rounds (job template)</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Define labels, order, and which round is marked final. Candidates share this ladder; extra rounds can still be added automatically when recruiters advance past the last step.
      </p>

      {isLoading && !draft ? (
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : sorted.length === 0 ? (
        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          No rounds yet — add rows or save to seed defaults on first interview.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sorted.map((r, idx) => (
            <div
              key={r.id ?? `new-${idx}`}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-600"
            >
              <label className="min-w-[140px] flex-1 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Label</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={r.round_label}
                  disabled={!canManage}
                  onChange={(e) => updateRow(idx, { round_label: e.target.value })}
                />
              </label>
              <label className="w-24 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Order</span>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={r.round_order}
                  disabled={!canManage}
                  onChange={(e) => updateRow(idx, { round_order: Number(e.target.value) || 1 })}
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={r.is_final}
                  disabled={!canManage}
                  onChange={(e) => updateRow(idx, { is_final: e.target.checked })}
                />
                Final
              </label>
              {canManage ? (
                <button type="button" className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700" onClick={() => removeRow(idx)}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={addRow} disabled={busy}>
            Add round
          </button>
          <button type="button" className={UI.primaryButton + " py-2 text-xs"} onClick={() => void saveRounds()} disabled={busy}>
            {busy ? "Saving…" : "Save rounds"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">View-only — editing requires jobs.manage.</p>
      )}

      <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pipeline WIP hints (this job)</h4>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Optional soft caps per stage; the pipeline board warns when counts exceed these values while this job is selected in filters.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STAGE_KEYS.map((k) => (
            <label key={k} className="text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400">{k}</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                placeholder="No limit"
                inputMode="numeric"
                disabled={!canManage}
                value={wipMerged[k] ?? ""}
                onChange={(e) => setWipDraft((p) => ({ ...p, [k]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {canManage ? (
          <button type="button" className={`${UI.primaryButton} mt-3 py-2 text-xs`} disabled={busy} onClick={() => void saveWip()}>
            Save WIP hints
          </button>
        ) : null}
      </div>
    </div>
  );
}
