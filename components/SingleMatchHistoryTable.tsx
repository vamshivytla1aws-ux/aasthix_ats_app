"use client";

import type { SingleMatchHistoryRun } from "@/lib/singleMatch/types";
import { Loader2 } from "lucide-react";

function decisionBadgeClass(d: string | null | undefined): string {
  const s = (d || "").toLowerCase();
  if (s.includes("reject")) return "bg-rose-100 text-rose-900";
  if (s.includes("hold")) return "bg-amber-100 text-amber-900";
  if (s.includes("proceed")) return "bg-emerald-100 text-emerald-900";
  return "bg-slate-100 text-slate-700";
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function modeLabel(useAi: boolean, row: SingleMatchHistoryRun): string {
  if (useAi && row.match_score_no_ai == null && row.ai_match_score != null) return "Pure AI";
  if (useAi) return "AI";
  return "No-AI";
}

export function SingleMatchHistoryTable({
  runs,
  loading,
  compact,
  migrationRequired,
}: {
  runs: SingleMatchHistoryRun[];
  loading?: boolean;
  compact?: boolean;
  migrationRequired?: boolean;
}) {
  if (migrationRequired) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Run SQL migration <code className="rounded bg-white px-1">0054_single_candidate_match_checks.sql</code> to save
        and view 1-to-1 match history.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading history…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-slate-500">
        No 1-to-1 checks yet for this job. Use <span className="font-semibold text-slate-700">AI Matching</span>{" "}
        to run a match — results appear here and are saved for next time.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Candidate</th>
              <th className="px-2 py-2">Mode</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{formatWhen(r.created_at)}</td>
                <td className="px-2 py-1.5 font-medium text-slate-900">{r.candidate_full_name}</td>
                <td className="px-2 py-1.5 text-slate-600">{modeLabel(r.use_ai, r)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-slate-800">{r.match_score}%</td>
                <td className="px-2 py-1.5">
                  {r.decision ? (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${decisionBadgeClass(r.decision)}`}>
                      {r.decision}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="max-h-[min(50vh,420px)] overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-[920px] w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="whitespace-nowrap px-3 py-2">When</th>
            <th className="px-3 py-2">Candidate</th>
            <th className="px-3 py-2">Mode</th>
            <th className="px-3 py-2">Overall</th>
            <th className="px-3 py-2">
              No-AI <span className="block font-normal normal-case text-violet-600">%</span>
            </th>
            <th className="px-3 py-2">
              AI <span className="block font-normal normal-case text-indigo-600">%</span>
            </th>
            <th className="px-3 py-2">Decision</th>
            <th className="px-3 py-2">
              No-AI <span className="block font-normal normal-case text-slate-500">decision</span>
            </th>
            <th className="px-3 py-2">
              AI <span className="block font-normal normal-case text-indigo-600">decision</span>
            </th>
            <th className="px-3 py-2">Matched</th>
            <th className="px-3 py-2">Gaps</th>
            <th className="min-w-[180px] px-3 py-2">Summary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((r) => (
            <tr key={r.id} className="bg-white align-top">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatWhen(r.created_at)}</td>
              <td className="px-3 py-2 text-sm font-medium text-slate-900">{r.candidate_full_name}</td>
              <td className="px-3 py-2 text-xs text-slate-700">{modeLabel(r.use_ai, r)}</td>
              <td className="px-3 py-2 font-semibold text-slate-900">{r.match_score}%</td>
              <td className="px-3 py-2 text-violet-800">{r.match_score_no_ai != null ? `${r.match_score_no_ai}%` : "—"}</td>
              <td className="px-3 py-2 text-indigo-800">{r.ai_match_score != null ? `${Math.round(r.ai_match_score)}%` : "—"}</td>
              <td className="px-3 py-2">
                {r.decision ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${decisionBadgeClass(r.decision)}`}>
                    {r.decision}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-xs text-slate-700">{r.decision_no_ai || "—"}</td>
              <td className="px-3 py-2 text-xs text-indigo-900">{r.ai_decision || "—"}</td>
              <td className="max-w-[140px] px-3 py-2 text-xs text-slate-600" title={r.matched_skills.join(", ")}>
                {r.matched_skills.length ? `${r.matched_skills.length} · ${r.matched_skills.slice(0, 3).join(", ")}${r.matched_skills.length > 3 ? "…" : ""}` : "—"}
              </td>
              <td className="max-w-[140px] px-3 py-2 text-xs text-slate-600" title={r.missing_required_skills.join(", ")}>
                {r.missing_required_skills.length
                  ? `${r.missing_required_skills.length} · ${r.missing_required_skills.slice(0, 3).join(", ")}${r.missing_required_skills.length > 3 ? "…" : ""}`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {(r.summary || r.reasoning || "—").slice(0, 160)}
                {(r.summary || r.reasoning || "").length > 160 ? "…" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
