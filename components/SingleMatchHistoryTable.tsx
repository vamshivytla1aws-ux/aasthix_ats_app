"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import type {
  SingleMatchCheckApiResponse,
  SingleMatchCheckResultPayload,
  SingleMatchHistoryRun,
} from "@/lib/singleMatch/types";
import { SingleMatchResultDetails } from "@/components/SingleMatchResultDetails";
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

function toPayload(run: SingleMatchHistoryRun): SingleMatchCheckResultPayload {
  return {
    match_score: run.match_score,
    match_score_no_ai: run.match_score_no_ai,
    ai_match_score: run.ai_match_score,
    decision: run.decision,
    decision_no_ai: run.decision_no_ai,
    ai_decision: run.ai_decision,
    matched_skills: run.matched_skills,
    missing_required_skills: run.missing_required_skills,
    reasoning: run.reasoning,
    summary: run.summary,
    resume_source: run.resume_source,
    resume_chars_scored: run.resume_chars_scored ?? null,
    jd_chars_scored: run.jd_chars_scored ?? null,
    ai_evidence_highlights: run.ai_evidence_highlights ?? [],
    requirement_breakdown: run.requirement_breakdown ?? [],
    confidence_score: run.confidence_score ?? null,
    confidence_reasons: run.confidence_reasons ?? [],
    resume_quality_flags: run.resume_quality_flags ?? [],
    decision_drivers: run.decision_drivers ?? [],
    risk_flags: run.risk_flags ?? [],
    interview_focus_areas: run.interview_focus_areas ?? [],
    follow_up_questions: run.follow_up_questions ?? [],
    recommended_next_step: run.recommended_next_step ?? null,
    evidence_quality: run.evidence_quality ?? null,
    fit_level: run.fit_level ?? null,
    score_breakdown: run.score_breakdown ?? null,
    partial_matches: run.partial_matches ?? [],
    missing_nice_to_have_requirements: run.missing_nice_to_have_requirements ?? [],
    critical_unknowns: run.critical_unknowns ?? [],
    red_flags: run.red_flags ?? [],
    recruiter_summary: run.recruiter_summary ?? null,
    candidate_feedback: run.candidate_feedback ?? null,
    resume_recovery_attempted: run.resume_recovery_attempted ?? false,
    resume_recovery_succeeded: run.resume_recovery_succeeded ?? false,
    resume_recovery_reason: run.resume_recovery_reason ?? null,
    resume_source_before_recovery: run.resume_source_before_recovery ?? null,
    resume_source_after_recovery: run.resume_source_after_recovery ?? null,
    debug_requirements: run.debug_requirements ?? [],
    developer_debug: run.developer_debug ?? undefined,
  };
}

export function SingleMatchHistoryTable({
  runs,
  loading,
  compact,
  migrationRequired,
  onSelectRun,
  selectedRunId,
  onRecomputeComplete,
  onRefreshRequested,
}: {
  runs: SingleMatchHistoryRun[];
  loading?: boolean;
  compact?: boolean;
  migrationRequired?: boolean;
  onSelectRun?: (run: SingleMatchHistoryRun) => void;
  selectedRunId?: number;
  onRecomputeComplete?: (run: SingleMatchHistoryRun, response: SingleMatchCheckApiResponse) => void | Promise<void>;
  onRefreshRequested?: () => void | Promise<void>;
}) {
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [recomputeRunId, setRecomputeRunId] = useState<number | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const activeRunId = selectedRunId ?? expandedRunId;

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? null,
    [runs, activeRunId]
  );

  const handleSelect = (run: SingleMatchHistoryRun) => {
    if (onSelectRun) {
      onSelectRun(run);
      return;
    }
    setExpandedRunId((current) => (current === run.id ? null : run.id));
  };

  const handleOpen = (run: SingleMatchHistoryRun, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handleSelect(run);
  };

  const handleRecompute = async (run: SingleMatchHistoryRun, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setTableError(null);
    setRecomputeRunId(run.id);
    try {
      const response = await apiFetchJson<SingleMatchCheckApiResponse>(`/api/jobs/${run.job_id}/single-match-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: run.candidate_id, useAI: run.use_ai }),
      });
      await onRefreshRequested?.();
      await onRecomputeComplete?.(run, response);
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Failed to recompute match";
      setTableError(message);
    } finally {
      setRecomputeRunId(null);
    }
  };

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

  return (
    <div className="space-y-3">
      {tableError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{tableError}</div>
      ) : null}
      <div className={`${compact ? "max-h-52" : "max-h-[min(50vh,420px)]"} overflow-auto rounded-xl border border-slate-200`}>
        <table className={`${compact ? "w-full text-left text-xs" : "min-w-[920px] w-full text-left text-sm"}`}>
          <thead className={`${compact ? "text-[10px]" : "text-xs"} sticky top-0 z-10 bg-slate-50 font-semibold uppercase text-slate-500`}>
            <tr>
              <th className={`${compact ? "px-2 py-2" : "whitespace-nowrap px-3 py-2"}`}>When</th>
              <th className={`${compact ? "px-2 py-2" : "px-3 py-2"}`}>Candidate</th>
              <th className={`${compact ? "px-2 py-2" : "px-3 py-2"}`}>Mode</th>
              <th className={`${compact ? "px-2 py-2" : "px-3 py-2"}`}>Overall</th>
              {!compact ? (
                <>
                  <th className="px-3 py-2">
                    No-AI <span className="block font-normal normal-case text-violet-600">%</span>
                  </th>
                  <th className="px-3 py-2">
                    AI <span className="block font-normal normal-case text-indigo-600">%</span>
                  </th>
                </>
              ) : null}
              <th className={`${compact ? "px-2 py-2" : "px-3 py-2"}`}>Decision</th>
              {!compact ? <th className="px-3 py-2">Matched</th> : null}
              {!compact ? <th className="px-3 py-2">Gaps</th> : null}
              {!compact ? <th className="min-w-[180px] px-3 py-2">Summary</th> : null}
              <th className={`${compact ? "px-2 py-2" : "px-3 py-2"}`}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((r) => {
              const selected = activeRunId === r.id;
              return (
                <tr
                  key={r.id}
                  className={`align-top ${selected ? "bg-indigo-50/60" : "bg-white"} cursor-pointer`}
                  onClick={() => handleSelect(r)}
                >
                  <td className={`${compact ? "whitespace-nowrap px-2 py-1.5" : "whitespace-nowrap px-3 py-2"} text-slate-600`}>
                    {formatWhen(r.created_at)}
                  </td>
                  <td className={`${compact ? "px-2 py-1.5" : "px-3 py-2"} font-medium text-slate-900`}>
                    <Link
                      href={`/candidates/${r.candidate_id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="text-blue-700 transition hover:text-blue-800 hover:underline"
                      title={`Open ${r.candidate_full_name} profile`}
                    >
                      {r.candidate_full_name}
                    </Link>
                  </td>
                  <td className={`${compact ? "px-2 py-1.5" : "px-3 py-2"} text-slate-700`}>{modeLabel(r.use_ai, r)}</td>
                  <td className={`${compact ? "whitespace-nowrap px-2 py-1.5" : "px-3 py-2"} font-semibold text-slate-900`}>
                    {r.match_score}%
                  </td>
                  {!compact ? (
                    <>
                      <td className="px-3 py-2 text-violet-800">{r.match_score_no_ai != null ? `${r.match_score_no_ai}%` : "—"}</td>
                      <td className="px-3 py-2 text-indigo-800">{r.ai_match_score != null ? `${Math.round(r.ai_match_score)}%` : "—"}</td>
                    </>
                  ) : null}
                  <td className={`${compact ? "px-2 py-1.5" : "px-3 py-2"}`}>
                    {r.decision ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${decisionBadgeClass(r.decision)}`}>
                        {r.decision}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {!compact ? (
                    <>
                      <td className="max-w-[140px] px-3 py-2 text-xs text-slate-600" title={r.matched_skills.join(", ")}>
                        {r.matched_skills.length
                          ? `${r.matched_skills.length} · ${r.matched_skills.slice(0, 3).join(", ")}${r.matched_skills.length > 3 ? "…" : ""}`
                          : "—"}
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
                    </>
                  ) : null}
                  <td className={`${compact ? "px-2 py-1.5" : "px-3 py-2"} whitespace-nowrap`}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => handleOpen(r, event)}
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={(event) => void handleRecompute(r, event)}
                        disabled={recomputeRunId === r.id}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {recomputeRunId === r.id ? "Recomputing..." : "Recompute"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeRun ? (
        <SingleMatchResultDetails
          result={toPayload(activeRun)}
          modeLabel={modeLabel(activeRun.use_ai, activeRun)}
          loadedFromHistoryAt={activeRun.created_at}
        />
      ) : null}
    </div>
  );
}
