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
  if (r.match_score_no_ai == null && r.ai_match_score != null) return "Pure AI (full JD <-> resume, OpenAI)";
  if (r.ai_match_score != null) return "AI-assisted";
  return "AI requested - unavailable (see reasoning)";
}

function resumeSourceLabel(source: SingleMatchCheckResultPayload["resume_source"]): string {
  switch (source) {
    case "uploaded_resume_file":
      return "uploaded resume file";
    case "stored_resume_text":
      return "stored resume text";
    case "experience_summary_or_skills":
      return "experience summary or skills";
    case "none":
      return "no usable resume source";
    default:
      return "unknown source";
  }
}

function requirementStatusClass(status: string | null | undefined): string {
  switch (status) {
    case "met":
      return "bg-emerald-100 text-emerald-900 border border-emerald-200";
    case "partially_met":
      return "bg-amber-100 text-amber-900 border border-amber-200";
    case "unclear_due_to_source_quality":
      return "bg-sky-100 text-sky-900 border border-sky-200";
    case "not_met":
      return "bg-rose-100 text-rose-900 border border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

function requirementStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "met":
      return "Met";
    case "partially_met":
      return "Partial";
    case "unclear_due_to_source_quality":
      return "Unclear";
    case "not_met":
      return "Missing";
    default:
      return "Unknown";
  }
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
      resume_source: latestRun.resume_source,
      resume_chars_scored: latestRun.resume_chars_scored ?? null,
      jd_chars_scored: latestRun.jd_chars_scored ?? null,
      ai_evidence_highlights: latestRun.ai_evidence_highlights ?? [],
      requirement_breakdown: latestRun.requirement_breakdown ?? [],
      confidence_score: latestRun.confidence_score ?? null,
      confidence_reasons: latestRun.confidence_reasons ?? [],
      resume_quality_flags: latestRun.resume_quality_flags ?? [],
      decision_drivers: latestRun.decision_drivers ?? [],
      risk_flags: latestRun.risk_flags ?? [],
      interview_focus_areas: latestRun.interview_focus_areas ?? [],
      follow_up_questions: latestRun.follow_up_questions ?? [],
      recommended_next_step: latestRun.recommended_next_step ?? null,
      evidence_quality: latestRun.evidence_quality ?? null,
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

  const resumeSourceWarning =
    result?.resume_source === "experience_summary_or_skills"
      ? {
          tone: "warning" as const,
          title: "Scoring is using fallback profile text",
          body:
            "This result is based on summary / skills fallback text instead of a parsed uploaded resume. We should treat missing skills and the percentage as low-confidence until a full resume is linked and parsed.",
        }
      : result?.resume_source === "none"
        ? {
            tone: "danger" as const,
            title: "No full resume was available for scoring",
            body:
              "This pure-AI result is running without usable resume text. Upload a PDF/DOCX resume or save resume text before trusting the score or gaps.",
          }
        : result?.resume_source === "stored_resume_text" &&
            typeof result.resume_chars_scored === "number" &&
            result.resume_chars_scored < 800
          ? {
              tone: "warning" as const,
              title: "Stored resume text looks short",
              body:
                "The match used stored resume text, but the scored text is quite short. If the uploaded resume has more detail, relink or reparse it so the full JD can be validated against the full resume.",
            }
          : null;

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
                  onChange={(e) => setSearch(e.target.value)}
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
                          <span className="break-words text-xs text-slate-600">
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
            <span>Use OpenAI - full JD &lt;-&gt; resume scoring (no Python matcher; same stack as bulk analyze)</span>
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

              <div className="mb-3 flex flex-wrap items-end gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Overall</div>
                  <div className="text-2xl font-bold text-slate-900">{result.match_score}%</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">No-AI</div>
                  <div className="text-lg font-semibold text-slate-800">
                    {result.match_score_no_ai != null ? `${result.match_score_no_ai}%` : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">AI</div>
                  <div className="text-lg font-semibold text-slate-800">
                    {result.ai_match_score != null ? `${Math.round(result.ai_match_score)}%` : "-"}
                  </div>
                </div>
                {result.confidence_score != null ? (
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-500">Confidence</div>
                    <div className="text-lg font-semibold text-slate-800">{result.confidence_score}%</div>
                  </div>
                ) : null}
                {result.evidence_quality ? (
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-500">Evidence</div>
                    <div className="text-sm font-semibold capitalize text-slate-800">{result.evidence_quality}</div>
                  </div>
                ) : null}
              </div>

              <div className="mb-2 flex flex-wrap gap-2">
                {result.decision ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${decisionBadgeClass(result.decision)}`}>
                    {result.decision}
                  </span>
                ) : null}
                {result.decision_no_ai ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${decisionBadgeClass(result.decision_no_ai)}`}>
                    No-AI: {result.decision_no_ai}
                  </span>
                ) : null}
                {result.ai_decision ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${decisionBadgeClass(result.ai_decision)}`}>
                    AI: {result.ai_decision}
                  </span>
                ) : null}
              </div>

              {result.summary ? <p className="mb-2 text-xs text-slate-600">{result.summary}</p> : null}
              {resumeSourceWarning ? (
                <div
                  className={`mb-2 rounded-lg border px-2 py-1.5 text-xs ${
                    resumeSourceWarning.tone === "danger"
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <div className="font-semibold">{resumeSourceWarning.title}</div>
                  <div className="mt-0.5">{resumeSourceWarning.body}</div>
                </div>
              ) : null}
              {result.reasoning ? (
                <p className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">{result.reasoning}</p>
              ) : null}

              {result.resume_source || result.resume_chars_scored != null || result.jd_chars_scored != null ? (
                <div className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-[11px] text-slate-700">
                  <span className="font-semibold text-indigo-900">Scored text:</span>{" "}
                  {result.resume_source ? `resume source ${resumeSourceLabel(result.resume_source)}` : "resume source unknown"}
                  {result.resume_chars_scored != null ? ` · resume chars ${result.resume_chars_scored}` : ""}
                  {result.jd_chars_scored != null ? ` · JD chars ${result.jd_chars_scored}` : ""}
                </div>
              ) : null}

              {result.ai_evidence_highlights?.length ? (
                <div className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-[11px] text-slate-700">
                  <div className="font-semibold text-emerald-900">AI evidence found in resume</div>
                  <ul className="mt-1 list-inside list-disc">
                    {result.ai_evidence_highlights.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.confidence_reasons?.length ? (
                <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
                  <div className="font-semibold text-slate-900">Confidence reasons</div>
                  <ul className="mt-1 list-inside list-disc">
                    {result.confidence_reasons.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.requirement_breakdown?.length ? (
                <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
                  <div className="mb-2 font-semibold text-slate-900">Requirement breakdown</div>
                  <div className="grid gap-2">
                    {result.requirement_breakdown.slice(0, 10).map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-slate-900">{item.label}</div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${requirementStatusClass(item.status)}`}>
                            {requirementStatusLabel(item.status)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                          <span>{item.bucket.replace(/_/g, " ")}</span>
                          <span>{item.priority.replace(/_/g, " ")}</span>
                        </div>
                        {item.rationale ? <p className="mt-1 text-[11px] text-slate-600">{item.rationale}</p> : null}
                        {item.evidence?.length ? (
                          <ul className="mt-1 list-inside list-disc text-[11px] text-slate-700">
                            {item.evidence.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                    {result.requirement_breakdown.length > 10 ? (
                      <div className="text-[11px] text-slate-500">+{result.requirement_breakdown.length - 10} more requirements evaluated</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {result.decision_drivers?.length ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700">
                    <div className="font-semibold text-slate-900">Decision drivers</div>
                    <ul className="mt-1 list-inside list-disc">
                      {result.decision_drivers.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.risk_flags?.length ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-900">
                    <div className="font-semibold">Risk flags</div>
                    <ul className="mt-1 list-inside list-disc">
                      {result.risk_flags.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.interview_focus_areas?.length ? (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-indigo-900">
                    <div className="font-semibold">Interview focus areas</div>
                    <ul className="mt-1 list-inside list-disc">
                      {result.interview_focus_areas.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.follow_up_questions?.length ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                    <div className="font-semibold">Follow-up questions</div>
                    <ul className="mt-1 list-inside list-disc">
                      {result.follow_up_questions.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {result.resume_quality_flags?.length ? (
                <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
                  <div className="font-semibold">Resume quality flags</div>
                  <ul className="mt-1 list-inside list-disc">
                    {result.resume_quality_flags.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.recommended_next_step ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                  <div className="font-semibold">Recommended next step</div>
                  <p className="mt-1">{result.recommended_next_step}</p>
                </div>
              ) : null}

              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
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
            {runBusy ? "Running..." : "Run single match"}
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
