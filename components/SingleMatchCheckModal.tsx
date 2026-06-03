"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { SingleMatchHistoryTable } from "@/components/SingleMatchHistoryTable";
import { SingleMatchResultDetails } from "@/components/SingleMatchResultDetails";
import type {
  SingleMatchCheckApiResponse,
  SingleMatchCheckResultPayload,
  SingleMatchHistoryApiResponse,
  SingleMatchHistoryRun,
} from "@/lib/singleMatch/types";
import { Loader2, PencilLine, UserRound, X } from "lucide-react";

type CandidatePick = {
  id: number;
  full_name: string;
  email: string | null;
  location: string | null;
};

function modeLabel(useAIRequested: boolean, result: SingleMatchCheckResultPayload): string {
  if (!useAIRequested) return "No-AI only (Python rule matcher)";
  if (result.match_score_no_ai == null && result.ai_match_score != null) {
    return "Pure AI (full JD <-> resume, OpenAI)";
  }
  if (result.ai_match_score != null) return "AI-assisted";
  return "AI requested - unavailable (see reasoning)";
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

export default function SingleMatchCheckModal({
  jobId,
  open,
  onClose,
  onHistorySaved,
}: {
  jobId: number;
  open: boolean;
  onClose: () => void;
  onHistorySaved?: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [candidates, setCandidates] = useState<CandidatePick[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<CandidatePick | null>(null);
  const [useAI, setUseAI] = useState(true);
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<SingleMatchCheckResultPayload | null>(null);
  const [lastUseAI, setLastUseAI] = useState(false);
  const [modalHistory, setModalHistory] = useState<SingleMatchHistoryRun[]>([]);
  const [modalHistoryMigration, setModalHistoryMigration] = useState(false);
  const [modalHistoryLoading, setModalHistoryLoading] = useState(false);
  const [loadedFromHistoryAt, setLoadedFromHistoryAt] = useState<string | null>(null);

  const loadModalHistory = useCallback(async () => {
    if (!jobId) return;
    setModalHistoryLoading(true);
    try {
      const response = await apiFetchJson<SingleMatchHistoryApiResponse>(`/api/jobs/${jobId}/single-match-check/history`);
      setModalHistory(response.runs || []);
      setModalHistoryMigration(Boolean(response.migration_required));
    } catch {
      setModalHistory([]);
    } finally {
      setModalHistoryLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!open || !jobId) return;
    void loadModalHistory();
  }, [open, jobId, loadModalHistory]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    if (debouncedSearch.length < 2) {
      setCandidates([]);
      setCandError(null);
      setCandLoading(false);
      return;
    }

    let cancelled = false;
    setCandLoading(true);
    setCandError(null);

    void (async () => {
      try {
        const rows = await apiFetchJson<CandidatePick[]>(
          `/api/candidates?q=${encodeURIComponent(debouncedSearch)}&limit=40`
        );
        if (cancelled) return;
        setCandidates(Array.isArray(rows) ? rows : []);
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Failed to load candidates";
        setCandError(message);
        setCandidates([]);
      } finally {
        if (!cancelled) setCandLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, open]);

  useEffect(() => {
    if (open) return;
    setSearch("");
    setDebouncedSearch("");
    setCandidates([]);
    setCandError(null);
    setSelectedId(null);
    setSelectedRecord(null);
    setUseAI(true);
    setRunBusy(false);
    setRunError(null);
    setResult(null);
    setLastUseAI(false);
    setModalHistory([]);
    setModalHistoryMigration(false);
    setModalHistoryLoading(false);
    setLoadedFromHistoryAt(null);
  }, [open]);

  useEffect(() => {
    if (!selectedId) {
      setLoadedFromHistoryAt(null);
      return;
    }

    const latestRun = modalHistory.find((run) => run.candidate_id === selectedId);
    if (!latestRun) {
      setLoadedFromHistoryAt(null);
      return;
    }

    setResult(toPayload(latestRun));
    setLastUseAI(Boolean(latestRun.use_ai));
    setRunError(null);
    setLoadedFromHistoryAt(latestRun.created_at);
  }, [modalHistory, selectedId]);

  const clearCandidateSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedRecord(null);
    setSearch("");
    setDebouncedSearch("");
    setCandidates([]);
    setCandError(null);
  }, []);

  const run = useCallback(async () => {
    if (!selectedId) return;
    setRunBusy(true);
    setRunError(null);
    setResult(null);
    setLoadedFromHistoryAt(null);
    setLastUseAI(useAI);
    try {
      const response = await apiFetchJson<SingleMatchCheckApiResponse>(`/api/jobs/${jobId}/single-match-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: selectedId, useAI }),
      });
      if (!response?.success || !response.result) {
        setRunError("Unexpected response from server");
        return;
      }
      setResult(response.result);
      await loadModalHistory();
      await onHistorySaved?.();
    } catch (error: unknown) {
      const message =
        error instanceof ApiError
          ? typeof error.payload === "object" && error.payload && "error" in error.payload
            ? String((error.payload as { error?: string }).error || error.message)
            : error.message
          : error instanceof Error
            ? error.message
            : "Request failed";
      setRunError(message);
    } finally {
      setRunBusy(false);
    }
  }, [jobId, loadModalHistory, onHistorySaved, selectedId, useAI]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close single match dialog backdrop"
        className="fixed inset-0 z-[110] bg-black/40"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[111] flex max-h-[min(92vh,780px)] w-[min(96vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="single-match-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
            <div>
              <h2 id="single-match-title" className="text-base font-semibold text-slate-900">
                1-to-1 match check
              </h2>
              <p className="text-xs text-slate-600">Does not update bulk match table or shortlist.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div>
            {selectedRecord ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900/80">Selected candidate</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{selectedRecord.full_name}</div>
                <div className="mt-0.5 break-words text-xs text-slate-600">
                  {[selectedRecord.email, selectedRecord.location].filter(Boolean).join(" · ") || `ID ${selectedRecord.id}`}
                </div>
                <button
                  type="button"
                  onClick={clearCandidateSelection}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                >
                  <PencilLine className="h-3.5 w-3.5" aria-hidden />
                  Change candidate
                </button>
              </div>
            ) : (
              <>
                <label className="text-xs font-semibold text-slate-700" htmlFor="single-match-search">
                  Find candidate
                </label>
                <input
                  id="single-match-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Type name, skill, or location (min 2 characters)"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {debouncedSearch.length > 0 && debouncedSearch.length < 2 ? (
                  <p className="mt-1 text-xs text-slate-500">Enter at least 2 characters to search.</p>
                ) : null}
                {candLoading ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                  </p>
                ) : null}
                {candError ? <p className="mt-1 text-xs text-rose-700">{candError}</p> : null}
                {candidates.length > 0 ? (
                  <ul
                    className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white text-sm"
                    role="listbox"
                    aria-label="Search results"
                  >
                    {candidates.map((candidate) => (
                      <li key={candidate.id} role="option" aria-selected={selectedId === candidate.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(candidate.id);
                            setSelectedRecord(candidate);
                          }}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-900">{candidate.full_name}</span>
                          <span className="break-words text-xs text-slate-600">
                            {[candidate.email, candidate.location].filter(Boolean).join(" · ") || `ID ${candidate.id}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(event) => setUseAI(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Use OpenAI - full JD &lt;-&gt; resume scoring (no Python matcher; same stack as bulk analyze)</span>
          </label>

          {runError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{runError}</div> : null}

          {result ? (
            <SingleMatchResultDetails
              result={result}
              modeLabel={modeLabel(lastUseAI, result)}
              loadedFromHistoryAt={loadedFromHistoryAt}
            />
          ) : null}

          <button
            type="button"
            disabled={!selectedId || runBusy}
            onClick={() => void run()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {runBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {runBusy ? "Running..." : "Run single match"}
          </button>

          <div className="border-t border-slate-200 pt-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">Saved history (this job)</div>
            <SingleMatchHistoryTable
              runs={modalHistory}
              loading={modalHistoryLoading}
              compact
              migrationRequired={modalHistoryMigration}
              onRefreshRequested={loadModalHistory}
              onRecomputeComplete={(run, response) => {
                setSelectedId(run.candidate_id);
                setSelectedRecord((current) =>
                  current?.id === run.candidate_id
                    ? current
                    : {
                        id: run.candidate_id,
                        full_name: run.candidate_full_name,
                        email: null,
                        location: null,
                      }
                );
                setUseAI(run.use_ai);
                setLastUseAI(run.use_ai);
                setRunError(null);
                setLoadedFromHistoryAt(null);
                setResult(response.result);
                void onHistorySaved?.();
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
