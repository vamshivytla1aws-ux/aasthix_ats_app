"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { SingleMatchHistoryTable } from "@/components/SingleMatchHistoryTable";
import type {
  SingleMatchCheckApiResponse,
  SingleMatchHistoryApiResponse,
  SingleMatchHistoryRun,
  SingleMatchCheckResultPayload,
} from "@/lib/singleMatch/types";
import { Loader2, UserRound, X, PencilLine } from "lucide-react";

type CandidatePick = {
  id: number;
  full_name: string;
  email: string | null;
  location: string | null;
};

function decisionBadgeClass(d: string | null | undefined): string {
  const s = (d || "").toLowerCase();
  if (s.includes("reject")) return "bg-rose-100 text-rose-900 border border-rose-200";
  if (s.includes("hold")) return "bg-amber-100 text-amber-900 border border-amber-200";
  if (s.includes("proceed")) return "bg-emerald-100 text-emerald-900 border border-emerald-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function modeLabel(useAIRequested: boolean, r: SingleMatchCheckResultPayload): string {
  if (!useAIRequested) return "No-AI only (Python rule matcher)";
  if (r.match_score_no_ai == null && r.ai_match_score != null) return "Pure AI (full JD ↔ resume, OpenAI)";
  if (r.ai_match_score != null) return "AI-assisted";
  return "AI requested — unavailable (see reasoning)";
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
  /** Refetch hub history after a successful run (optional). */
  onHistorySaved?: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [candidates, setCandidates] = useState<CandidatePick[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** Kept after pick so we can hide the result list without losing the chosen row. */
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
      const h = await apiFetchJson<SingleMatchHistoryApiResponse>(`/api/jobs/${jobId}/single-match-check/history`);
      setModalHistory(h.runs || []);
      setModalHistoryMigration(Boolean(h.migration_required));
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
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(t);
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
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to load candidates";
        setCandError(msg);
        setCandidates([]);
      } finally {
        if (!cancelled) setCandLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, debouncedSearch]);

  useEffect(() => {
    if (!open) {
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
    }
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

    setResult({
      match_score: latestRun.match_score,
      match_score_no_ai: latestRun.match_score_no_ai,
      ai_match_score: latestRun.ai_match_score,
      decision: latestRun.decision,
      decision_no_ai: latestRun.decision_no_ai,
      ai_decision: latestRun.ai_decision,
      matched_skills: latestRun.matched_skills,
      missing_required_skills: latestRun.missing_required_skills,
      reasoning: latestRun.reasoning,
      summary: latestRun.summary,
    });
    setLastUseAI(Boolean(latestRun.use_ai));
    setRunError(null);
    setLoadedFromHistoryAt(latestRun.created_at);
  }, [selectedId, modalHistory]);

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
      const res = await apiFetchJson<SingleMatchCheckApiResponse>(`/api/jobs/${jobId}/single-match-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: selectedId, useAI }),
      });
      if (!res?.success || !res.result) {
        setRunError("Unexpected response from server");
        return;
      }
      setResult(res.result);
      void loadModalHistory();
      void onHistorySaved?.();
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? typeof e.payload === "object" && e.payload && "error" in e.payload
            ? String((e.payload as { error?: string }).error || e.message)
            : e.message
          : e instanceof Error
            ? e.message
            : "Request failed";
      setRunError(msg);
    } finally {
      setRunBusy(false);
    }
  }, [jobId, selectedId, useAI, loadModalHistory, onHistorySaved]);

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
        className="fixed left-1/2 top-1/2 z-[111] flex max-h-[min(92vh,780px)] w-[min(96vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="single-match-title"
        onClick={(e) => e.stopPropagation()}
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
                <div className="mt-0.5 text-xs text-slate-600 break-words">
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
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {debouncedSearch.length > 0 && debouncedSearch.length < 2 ? (
                  <p className="mt-1 text-xs text-slate-500">Enter at least 2 characters to search.</p>
                ) : null}
                {candLoading ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                  </p>
                ) : null}
                {candError ? <p className="mt-1 text-xs text-rose-700">{candError}</p> : null}
                {candidates.length > 0 ? (
                  <ul
                    className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white text-sm"
                    role="listbox"
                    aria-label="Search results"
                  >
                    {candidates.map((c) => (
                      <li key={c.id} role="option" aria-selected={selectedId === c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(c.id);
                            setSelectedRecord(c);
                          }}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-900">{c.full_name}</span>
                          <span className="text-xs text-slate-600 break-words">
                            {[c.email, c.location].filter(Boolean).join(" · ") || `ID ${c.id}`}
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
              onChange={(e) => setUseAI(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Use OpenAI — full JD ↔ resume scoring (no Python matcher; same stack as bulk analyze)</span>
          </label>

          {runError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{runError}</div> : null}

          {result ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
                  {modeLabel(lastUseAI, result)}
                </span>
              </div>
              {loadedFromHistoryAt ? (
                <p className="mb-2 text-[11px] text-slate-500">
                  Loaded saved result from {new Date(loadedFromHistoryAt).toLocaleString()}.
                </p>
              ) : null}
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Overall</div>
                  <div className="text-2xl font-bold text-slate-900">{result.match_score}%</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">No-AI</div>
                  <div className="text-lg font-semibold text-slate-800">
                    {result.match_score_no_ai != null ? `${result.match_score_no_ai}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">AI</div>
                  <div className="text-lg font-semibold text-slate-800">
                    {result.ai_match_score != null ? `${Math.round(result.ai_match_score)}%` : "—"}
                  </div>
                </div>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {result.decision ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${decisionBadgeClass(result.decision)}`}>
                    {result.decision}
                  </span>
                ) : null}
                {result.decision_no_ai ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${decisionBadgeClass(result.decision_no_ai)}`}
                    title="Rule-based decision"
                  >
                    No-AI: {result.decision_no_ai}
                  </span>
                ) : null}
                {result.ai_decision ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${decisionBadgeClass(result.ai_decision)}`}
                    title="AI decision"
                  >
                    AI: {result.ai_decision}
                  </span>
                ) : null}
              </div>
              {result.summary ? <p className="mb-2 text-xs text-slate-600">{result.summary}</p> : null}
              {result.reasoning ? (
                <p className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">{result.reasoning}</p>
              ) : null}
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <div className="font-semibold text-emerald-800">Matched required</div>
                  <ul className="mt-0.5 list-inside list-disc text-slate-700">
                    {result.matched_skills.length ? (
                      result.matched_skills.slice(0, 24).map((s) => <li key={s}>{s}</li>)
                    ) : (
                      <li className="list-none text-slate-500">None listed</li>
                    )}
                    {result.matched_skills.length > 24 ? (
                      <li className="list-none text-slate-500">+{result.matched_skills.length - 24} more</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <div className="font-semibold text-amber-900">Missing required</div>
                  <ul className="mt-0.5 list-inside list-disc text-slate-700">
                    {result.missing_required_skills.length ? (
                      result.missing_required_skills.slice(0, 24).map((s) => <li key={s}>{s}</li>)
                    ) : (
                      <li className="list-none text-slate-500">None listed</li>
                    )}
                    {result.missing_required_skills.length > 24 ? (
                      <li className="list-none text-slate-500">+{result.missing_required_skills.length - 24} more</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!selectedId || runBusy}
            onClick={() => void run()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {runBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {runBusy ? "Running…" : "Run single match"}
          </button>

          <div className="border-t border-slate-200 pt-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">Saved history (this job)</div>
            <SingleMatchHistoryTable
              runs={modalHistory}
              loading={modalHistoryLoading}
              compact
              migrationRequired={modalHistoryMigration}
            />
          </div>
        </div>
      </div>
    </>
  );
}
