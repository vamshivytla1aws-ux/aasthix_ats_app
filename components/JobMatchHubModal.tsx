"use client";

import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { X, RefreshCw, Users, Sparkles, TrendingUp, Loader2, UserRound } from "lucide-react";
import SingleMatchCheckModal from "@/components/SingleMatchCheckModal";
import { SingleMatchHistoryTable } from "@/components/SingleMatchHistoryTable";
import { MATCH_BULK_UI_ENABLED } from "@/lib/config/matchUi";
import type { SingleMatchHistoryApiResponse, SingleMatchHistoryRun } from "@/lib/singleMatch/types";
import { fitTierFromScore } from "@/lib/shortlistService";

type Job = {
  id: number;
  title: string;
  company: string;
  location?: string;
  description?: string | null;
};

type ProfileRow = {
  must_have_skills: string | null;
  nice_to_have_skills: string | null;
  role_keywords: string | null;
  extraction_mode: string | null;
  profile_updated_at: string | null;
};

type MatchBreakdownV2 = {
  version?: number;
  rule_score?: number;
  ai_score?: number | null;
  hybrid_score?: number;
  hybrid_weights?: { rule: number; ai: number };
  skills_component?: number;
  experience_component?: number;
  title_component?: number;
  location_component?: number;
  bonus_component?: number;
  must_matched?: number;
  must_total?: number;
  nice_matched?: number;
  nice_total?: number;
  keyword_hits?: number;
  penalties?: string[];
  summary?: string[];
  ai_matched_skills?: string[];
  ai_missing_skills?: string[];
  ai_reasoning?: string;
  ai_category_scores?: {
    domain_relevance: number;
    core_skills: number;
    business_impact: number;
    stakeholder_management: number;
    advanced_analytics: number;
    tools_tech: number;
    experience: number;
  };
  ai_responsibility_comparison?: string[];
  ai_strengths?: string[];
  ai_gaps?: string[];
  ai_risk_flags?: string[];
  ai_recruiter_decision?: "Proceed to Interview" | "Hold" | "Reject";
  ai_candidate_name?: string;
  ai_decision_reason?: string;
  ai_recruiter_summary?: string;
  ai_parsed_profile?: {
    jd_primary_themes: string[];
    resume_domain_evidence: string[];
    tools_evidence: string[];
    impact_evidence: string[];
    stakeholder_evidence: string[];
  };
  scoring_mode?: "ai_primary" | "rule_only" | "quick_filter" | "embedding_rank" | "pair_rerank";
  ai_match_rank?: number | null;
  ai_shortlisted?: boolean;
  ai_fit_tier?: "Strong Fit" | "Potential" | "Low Fit";
  job_experience_label?: string | null;
  candidate_years_estimated?: number | null;
};

type MatchRow = {
  candidate_id: number;
  match_score: number;
  matched_skills: string | null;
  missing_must_have: string | null;
  match_breakdown: MatchBreakdownV2 | null;
  match_score_no_ai: number | null;
  hire_probability: number | null;
  decision_no_ai: string | null;
  no_ai_rank?: number | null;
  ai_rerank_rank?: number | null;
  ai_rerank_score?: number | null;
  ai_rerank_decision?: string | null;
  ai_rerank_reason?: string | null;
  already_applied: boolean;
  application_stage: string | null;
  full_name: string;
  email: string | null;
  skills: string | null;
  location: string | null;
  notice_period: string | null;
};

const MATCH_TABLE_COLS = 16;

type Insights = {
  top_missing_skills_among_weak_matches: { skill: string; count: number }[];
  match_distribution: { high: number; medium: number; low: number; total: number };
};

function noAiDecisionBadgeClass(d: string | null | undefined): string {
  const s = (d || "").toLowerCase();
  if (s === "proceed") return "bg-emerald-100 text-emerald-900";
  if (s === "hold") return "bg-amber-100 text-amber-900";
  if (s === "reject") return "bg-rose-100 text-rose-900";
  return "bg-slate-100 text-slate-700";
}

export default function JobMatchHubModal({
  job,
  open,
  onClose,
}: {
  job: Job | null;
  open: boolean;
  onClose: () => void;
}) {
  const [fullJob, setFullJob] = useState<Job | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shortlistStage, setShortlistStage] = useState<"Screening" | "Applied">("Screening");
  const [shortlistBusy, setShortlistBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [detailCandidateId, setDetailCandidateId] = useState<number | null>(null);
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const [extractAsyncBusy, setExtractAsyncBusy] = useState(false);
  const [noAiBusy, setNoAiBusy] = useState(false);
  const [hybridBusy, setHybridBusy] = useState(false);
  const [singleCheckOpen, setSingleCheckOpen] = useState(false);
  const [singleMatchHistory, setSingleMatchHistory] = useState<SingleMatchHistoryRun[]>([]);
  const [singleMatchHistoryMigration, setSingleMatchHistoryMigration] = useState(false);
  const [queueRun, setQueueRun] = useState<{
    runId: number;
    status: string;
    progress_percent: number;
    total_candidates: number;
    completed_count: number;
    failed_count: number;
    last_error: string | null;
    embedding_preview?: unknown | null;
  } | null>(null);

  const sortedMatches = useMemo(() => {
    const rankKey = (m: MatchRow) => {
      const ai = m.ai_rerank_rank;
      const no = m.no_ai_rank;
      const ms = m.match_score_no_ai ?? -1;
      return [ai ?? 999, no ?? 999, -ms, -m.match_score] as const;
    };
    return [...matches].sort((a, b) => {
      const ka = rankKey(a);
      const kb = rankKey(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
      }
      return a.full_name.localeCompare(b.full_name);
    });
  }, [matches]);

  const loadSingleMatchHistoryOnly = useCallback(async () => {
    if (!job?.id) return;
    try {
      const hist = await apiFetchJson<SingleMatchHistoryApiResponse>(
        `/api/jobs/${job.id}/single-match-check/history`
      );
      setSingleMatchHistory(hist.runs || []);
      setSingleMatchHistoryMigration(Boolean(hist.migration_required));
    } catch {
      setSingleMatchHistory([]);
    }
  }, [job?.id]);

  const load = useCallback(async () => {
    if (!job?.id) return;
    setLoading(true);
    setToast(null);
    try {
      const [j, m, ins, hist] = await Promise.all([
        apiFetchJson<Job>(`/api/jobs/${job.id}`),
        apiFetchJson<{ profile: ProfileRow | null; matches: MatchRow[]; migration_required?: boolean }>(
          `/api/jobs/${job.id}/skill-matches?limit=50&min_score=0`
        ),
        apiFetchJson<Insights & { migration_required?: boolean }>(`/api/jobs/${job.id}/hiring-insights`).catch(() => null),
        apiFetchJson<SingleMatchHistoryApiResponse>(`/api/jobs/${job.id}/single-match-check/history`).catch(
          () => ({ runs: [] }) as SingleMatchHistoryApiResponse
        ),
      ]);
      setFullJob(j);
      setProfile(m.profile);
      setMatches(m.matches || []);
      setMigrationRequired(Boolean(m.migration_required));
      if (ins && !ins.migration_required) setInsights(ins);
      setSingleMatchHistory(hist.runs || []);
      setSingleMatchHistoryMigration(Boolean(hist.migration_required));
    } catch (e: any) {
      setToast(e?.message || "Failed to load match data");
    } finally {
      setLoading(false);
    }
  }, [job?.id]);

  useEffect(() => {
    if (open && job?.id) {
      setSelected(new Set());
      void load();
    }
  }, [open, job?.id, load]);

  useEffect(() => {
    if (!open) setSingleCheckOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (singleCheckOpen) {
        setSingleCheckOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, singleCheckOpen]);

  useEffect(() => {
    if (!job?.id || !queueRun) return;
    const terminal = queueRun.status === "completed" || queueRun.status === "failed";
    if (terminal) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const p = await apiFetchJson<{
          status: string;
          progress_percent: number;
          total_candidates: number;
          completed_count: number;
          failed_count: number;
          last_error: string | null;
          embedding_preview?: unknown | null;
        }>(`/api/jobs/${job.id}/skill-profile/extract-async?runId=${queueRun.runId}`);
        if (cancelled) return;
        setQueueRun((prev) =>
          prev
            ? {
                ...prev,
                status: p.status,
                progress_percent: p.progress_percent,
                total_candidates: p.total_candidates,
                completed_count: p.completed_count,
                failed_count: p.failed_count,
                last_error: p.last_error,
                embedding_preview: p.embedding_preview ?? prev.embedding_preview,
              }
            : null
        );
        if (p.status === "completed" || p.status === "failed") {
          await load();
          if (p.status === "failed" && p.last_error) {
            setToast(`Queue run failed: ${p.last_error}`);
          } else if (p.status === "completed") {
            setToast("Background match run completed.");
          }
        }
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [job?.id, queueRun?.runId, queueRun?.status, load]);

  async function runExtract() {
    if (!job?.id) return;
    setExtractBusy(true);
    setToast(null);
    const ac = new AbortController();
    const clientTimeoutMs = 600_000;
    const timer = setTimeout(() => ac.abort(), clientTimeoutMs);
    try {
      const ex = await apiFetchJson<{ ai_hybrid?: boolean }>(`/api/jobs/${job.id}/skill-profile/extract`, {
        method: "POST",
        signal: ac.signal,
      });
      await load();
      const ins = await apiFetchJson<Insights>(`/api/jobs/${job.id}/hiring-insights`).catch(() => null);
      if (ins) setInsights(ins);
      setToast(
        ex?.ai_hybrid
          ? "JD profile saved. Match scores blend rule checks with full JD↔resume AI (open Debug on a row for rubric and reasoning)."
          : "JD profile saved and candidates rescored (rule-based only — unset MATCH_AI_DISABLED for AI matching)."
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const aborted =
        (e as { name?: string })?.name === "AbortError" || msg.toLowerCase().includes("abort");
      if (aborted) {
        setToast(
          `Request stopped after ${Math.round(clientTimeoutMs / 60_000)} minutes (browser limit). Set MATCH_AI_LITE=1 on the server for faster, smaller AI responses.`
        );
      } else {
        setToast(msg || "Extract failed — run DB migration 0032 if needed.");
      }
    } finally {
      clearTimeout(timer);
      setExtractBusy(false);
    }
  }

  async function runNoAiRescore() {
    if (!job?.id) return;
    setNoAiBusy(true);
    setToast(null);
    try {
      await apiFetchJson<{ success?: boolean }>("/api/match/no-ai", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jobId: String(job.id) }),
	});
	await load();
      setToast("No-AI re-score completed.");
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Matching failed";
      setToast(msg || "Matching failed");
    } finally {
      setNoAiBusy(false);
    }
  }

  async function runHybridRecompute() {
    if (!job?.id) return;
    setHybridBusy(true);
    setToast(null);
    try {
      await apiFetchJson(`/api/jobs/${job.id}/recompute-matches`, { method: "POST" });
      await load();
      setToast("Hybrid match complete: No-AI bulk + single AI rerank for top 10.");
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Hybrid matching failed";
      setToast(msg || "Hybrid matching failed");
    } finally {
      setHybridBusy(false);
    }
  }

const noAiTopIds = useMemo(
  () =>
    new Set(
      matches
        .filter((m) => m.no_ai_rank != null && m.no_ai_rank <= 10)
        .map((m) => m.candidate_id)
    ),
  [matches]
);

const hybridTopIds = useMemo(
  () =>
    new Set(
      matches
        .filter((m) => m.ai_rerank_rank != null && m.ai_rerank_rank <= 10)
        .map((m) => m.candidate_id)
    ),
  [matches]
);

const hasHybridTop10 = hybridTopIds.size > 0;

const effectiveAiShortlistIds = useMemo(() => {
  if (hasHybridTop10) return hybridTopIds;

  return new Set(
    matches
      .filter((m) => m.match_breakdown?.ai_shortlisted === true)
      .map((m) => m.candidate_id)
  );
}, [matches, hasHybridTop10, hybridTopIds]);

const visibleMatches = useMemo(() => {
  if (!shortlistOnly) return sortedMatches;
  return sortedMatches.filter((m) => effectiveAiShortlistIds.has(m.candidate_id));
}, [sortedMatches, shortlistOnly, effectiveAiShortlistIds]);
	
  async function runExtractAsync() {
    if (!job?.id) return;
    setExtractAsyncBusy(true);
    setToast(null);
    try {
      const r = await apiFetchJson<{ runId: number; total_candidates: number; ok?: boolean }>(
        `/api/jobs/${job.id}/skill-profile/extract-async`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority: 1 }) }
      );
      setQueueRun({
        runId: r.runId,
        status: "queued",
        progress_percent: 0,
        total_candidates: r.total_candidates,
        completed_count: 0,
        failed_count: 0,
        last_error: null,
        embedding_preview: null,
      });
      setToast(
        `Queued ${r.total_candidates} candidates (run #${r.runId}). Ensure REDIS_URL and npm run worker:ai-match are running.`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setToast(msg.includes("503") || msg.toLowerCase().includes("redis")
        ? "Queue unavailable — set REDIS_URL and run the worker, or use synchronous Analyze."
        : msg || "Queue failed.");
    } finally {
      setExtractAsyncBusy(false);
    }
  }

  async function shortlist() {
    if (!job?.id || selected.size === 0) return;
    setShortlistBusy(true);
    setToast(null);
    try {
      await apiFetchJson(`/api/jobs/${job.id}/shortlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_ids: [...selected], stage: shortlistStage }),
      });
      setToast(`Shortlisted ${selected.size} to ${shortlistStage}.`);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      setToast(e?.message || "Shortlist failed (need pipeline.manage permission).");
    } finally {
      setShortlistBusy(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

function selectAiShortlisted() {
  const ids = Array.from(effectiveAiShortlistIds);
  setSelected(new Set(ids));
  setToast(
    ids.length
      ? `Selected ${ids.length} ${hasHybridTop10 ? "hybrid top-10" : "AI-shortlisted"} candidate${ids.length === 1 ? "" : "s"}. Pick pipeline stage and click Shortlist.`
      : hasHybridTop10
        ? "No hybrid top 10 found — run Hybrid recompute first."
        : "No AI shortlist on these rows — run Analyze full JD & resumes first."
  );
}

  if (!open || !job) return null;

  const jd = fullJob?.description || job.description || "";

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(92vh,calc(100dvh-1.5rem))] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-match-hub-title"
      >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <div id="job-match-hub-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                JD &amp; resume match hub
              </div>
              <div className="text-sm text-slate-600">
                {job.title} — {job.company}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
              {MATCH_BULK_UI_ENABLED ? (
                <>
                  <button
                    type="button"
                    onClick={runExtract}
                    disabled={extractBusy || noAiBusy || hybridBusy}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {extractBusy ? "Working…" : "Analyze full JD & resumes"}
                  </button>
                  <button
                    type="button"
                    title="No-AI bulk on pool, then one AI call to rerank top 10 (compact payloads)"
                    onClick={() => void runHybridRecompute()}
                    disabled={hybridBusy || extractBusy || noAiBusy}
                    className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {hybridBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {hybridBusy ? "Hybrid…" : "Hybrid recompute"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runExtractAsync()}
                    disabled={extractAsyncBusy || extractBusy || hybridBusy}
                    title="Requires Redis + worker process for large candidate sets"
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {extractAsyncBusy ? "Queueing…" : "Queue analyze (async)"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                title="Fast rule-based matching (no AI)"
                onClick={() => void runNoAiRescore()}
                disabled={noAiBusy || (MATCH_BULK_UI_ENABLED && (extractBusy || hybridBusy))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {noAiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {noAiBusy ? "Re-scoring…" : "Re-score (No AI)"}
              </button>
              <button
                type="button"
                title="Score one candidate against this JD without bulk matching or changing the match table"
                onClick={() => setSingleCheckOpen(true)}
                disabled={noAiBusy || (MATCH_BULK_UI_ENABLED && (extractBusy || hybridBusy))}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50"
              >
                <UserRound className="h-3.5 w-3.5" />
                Check one candidate
              </button>
              <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {toast ? <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">{toast}</div> : null}
          {noAiBusy ? (
            <div className="border-b border-violet-200 bg-violet-50 px-5 py-1.5 text-xs font-medium text-violet-900">
              Re-scoring… — fast rule-based matcher (no AI)
            </div>
          ) : null}
          {MATCH_BULK_UI_ENABLED && hybridBusy ? (
            <div className="border-b border-violet-200 bg-violet-50 px-5 py-1.5 text-xs font-medium text-violet-900">
              Hybrid pipeline… — No-AI matcher + single AI rerank (top 10)
            </div>
          ) : null}
          {MATCH_BULK_UI_ENABLED && queueRun ? (
            <div className="border-b border-indigo-100 bg-indigo-50/90 px-5 py-2 text-xs text-indigo-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-indigo-900">Background queue</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 font-medium text-indigo-800">
                    {queueRun.status === "queued"
                      ? "Pending"
                      : queueRun.status === "active"
                        ? "Processing"
                        : queueRun.status === "completed"
                          ? "Completed"
                          : queueRun.status === "failed"
                            ? "Failed"
                            : queueRun.status}
                  </span>
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-indigo-600 underline"
                    onClick={() => setQueueRun(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-indigo-200">
                <div
                  className="h-full bg-indigo-600 transition-[width] duration-300"
                  style={{ width: `${Math.min(100, queueRun.progress_percent)}%` }}
                />
              </div>
              <div className="mt-1 text-indigo-800">
                {queueRun.completed_count} / {queueRun.total_candidates} candidates · {queueRun.progress_percent}%
                {queueRun.failed_count > 0 ? (
                  <span className="ml-2 text-rose-700">({queueRun.failed_count} failed)</span>
                ) : null}
              </div>
              {queueRun.status === "failed" && queueRun.last_error ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-rose-800">{queueRun.last_error}</span>
                  <button
                    type="button"
                    className="rounded border border-rose-300 bg-white px-2 py-0.5 font-semibold text-rose-900"
                    onClick={() => void runExtractAsync()}
                  >
                    Retry queue
                  </button>
                </div>
              ) : null}
              {queueRun.embedding_preview &&
              typeof queueRun.embedding_preview === "object" &&
              queueRun.embedding_preview !== null &&
              "top_preview" in queueRun.embedding_preview ? (
                <div className="mt-2 max-h-28 overflow-y-auto rounded border border-indigo-200 bg-white/90 p-2 text-[11px] text-slate-700">
                  <div className="font-semibold text-indigo-950">
                    Streaming preview —{" "}
                    {(queueRun.embedding_preview as { phase?: string }).phase === "embedding"
                      ? "embedding rank"
                      : (queueRun.embedding_preview as { phase?: string }).phase === "rerank"
                        ? "after pair rerank"
                        : "partial results"}
                  </div>
                  <ul className="mt-1 list-inside list-disc">
                    {(
                      (queueRun.embedding_preview as { top_preview?: { id: number; name: string; score: number }[] })
                        .top_preview || []
                    )
                      .slice(0, 12)
                      .map((r) => (
                        <li key={r.id}>
                          {(r.name || "Candidate").slice(0, 48)} — {r.score}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {migrationRequired ? (
            <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-sm text-rose-800">
              Run SQL migration <code className="rounded bg-white px-1">0032_job_skill_matching.sql</code> to enable matching.
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job description</div>
                <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700">
                  {jd.trim() || "No description — add one for accurate JD↔resume matching."}
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="text-xs font-semibold text-slate-600">Extracted from JD</div>
                  {loading && !profile ? (
                    <div className="mt-2 text-xs text-slate-500">Loading…</div>
                  ) : (
                    <>
                      <div className="mt-1 text-xs text-slate-500">
                        Mode: <span className="font-medium text-slate-800">{profile?.extraction_mode || "—"}</span>
                        {profile?.profile_updated_at ? (
                          <span className="ml-2 text-slate-400">
                            · Updated {new Date(profile.profile_updated_at).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs">
                        <span className="font-semibold text-emerald-800">Must-have:</span>{" "}
                        <span className="text-slate-700">{profile?.must_have_skills || "Run extract"}</span>
                      </div>
                      <div className="mt-1 text-xs">
                        <span className="font-semibold text-blue-800">Nice-to-have:</span>{" "}
                        <span className="text-slate-700">{profile?.nice_to_have_skills || "—"}</span>
                      </div>
                      <div className="mt-1 text-xs">
                        <span className="font-semibold text-violet-800">Keywords:</span>{" "}
                        <span className="text-slate-700">{profile?.role_keywords || "—"}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <TrendingUp className="h-4 w-4" />
                  Hiring insights
                </div>
                {!insights ? (
                  <div className="mt-2 text-xs text-slate-500">Run extract to populate gap analysis.</div>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-emerald-50 py-2">
                        <div className="text-lg font-bold text-emerald-800">{insights.match_distribution?.high ?? 0}</div>
                        <div className="text-[10px] font-semibold text-emerald-700">Strong (≥80)</div>
                      </div>
                      <div className="rounded-lg bg-amber-50 py-2">
                        <div className="text-lg font-bold text-amber-800">{insights.match_distribution?.medium ?? 0}</div>
                        <div className="text-[10px] font-semibold text-amber-700">Mid (50–79)</div>
                      </div>
                      <div className="rounded-lg bg-slate-100 py-2">
                        <div className="text-lg font-bold text-slate-800">{insights.match_distribution?.low ?? 0}</div>
                        <div className="text-[10px] font-semibold text-slate-600">Low (&lt;50)</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs font-semibold text-slate-700">Common gaps (weak matches)</div>
                    <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                      {(insights.top_missing_skills_among_weak_matches || []).slice(0, 6).map((g) => (
                        <li key={g.skill}>
                          {g.skill} <span className="text-slate-400">({g.count})</span>
                        </li>
                      ))}
                      {!(insights.top_missing_skills_among_weak_matches || []).length ? (
                        <li className="list-none text-slate-400">No gap data yet.</li>
                      ) : null}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 px-5 py-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <UserRound className="h-4 w-4 text-teal-600" />
                1-to-1 match history
              </div>
              <p className="mb-3 text-xs text-slate-600">
                Saved runs for this job. Open <span className="font-medium">Check one candidate</span> to add a row — prior
                results stay here so you can skip repeat AI calls when reviewing the same person.
              </p>
              <SingleMatchHistoryTable
                runs={singleMatchHistory}
                loading={loading}
                migrationRequired={singleMatchHistoryMigration}
              />
            </div>

            {MATCH_BULK_UI_ENABLED ? (
            <div className="border-t border-slate-200 px-5 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Users className="h-4 w-4 text-blue-600" />
                  Top matched candidates
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={shortlistOnly}
                      onChange={(e) => setShortlistOnly(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    {hasHybridTop10 ? "Hybrid top 10 only" : "AI shortlist only"}
                  </label>
                  <button
                    type="button"
                    onClick={selectAiShortlisted}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                   {hasHybridTop10 ? "Select top 10 (Hybrid)" : "Select top 10 (AI)"}
                  </button>
                  <select
                    value={shortlistStage}
                    onChange={(e) => setShortlistStage(e.target.value as "Screening" | "Applied")}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    <option value="Screening">Move to Screening</option>
                    <option value="Applied">Move to Applied</option>
                  </select>
                  <button
                    type="button"
                    disabled={selected.size === 0 || shortlistBusy}
                    onClick={shortlist}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {shortlistBusy ? "Saving…" : `Shortlist (${selected.size})`}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200">
                <div className="max-h-[55vh] overflow-auto overscroll-contain">
                  <table className="min-w-[1400px] text-left text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="sticky left-0 z-30 w-12 bg-slate-50 px-3 py-2"> </th>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Match</th>
                      <th className="px-3 py-2">
                        Match % <span className="block font-normal text-violet-600">No AI</span>
                      </th>
                      <th className="px-3 py-2">
                        Hire <span className="block font-normal text-violet-600">prob.</span>
                      </th>
                      <th className="px-3 py-2">
                        Decision <span className="block font-normal text-violet-600">No AI</span>
                      </th>
                      <th className="px-3 py-2">
                        No-AI <span className="block font-normal text-slate-500">rank</span>
                      </th>
                      <th className="px-3 py-2">
                        AI rerank <span className="block font-normal text-indigo-600">rank</span>
                      </th>
                      <th className="px-3 py-2">
                        AI <span className="block font-normal text-indigo-600">score</span>
                      </th>
                      <th className="px-3 py-2">
                        AI <span className="block font-normal text-indigo-600">decision</span>
                      </th>
                      <th className="px-3 py-2">Candidate</th>
                      <th className="px-3 py-2">
                        Matched
                        <span className="block font-normal text-slate-500">AI / semantic</span>
                      </th>
                      <th className="px-3 py-2">
                        Gaps
                        <span className="block font-normal text-slate-500">AI / rule</span>
                      </th>
                      <th className="px-3 py-2">Pipeline</th>
                      <th className="sticky right-24 z-30 w-24 bg-slate-50 px-3 py-2">Debug</th>
                      <th className="sticky right-0 z-30 w-24 bg-slate-50 px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={MATCH_TABLE_COLS} className="px-3 py-8 text-center text-slate-500">
                          Loading matches…
                        </td>
                      </tr>
                    ) : matches.length === 0 ? (
                      <tr>
                        <td colSpan={MATCH_TABLE_COLS} className="px-3 py-8 text-center text-slate-500">
                          No scores yet. Click &quot;Analyze full JD &amp; resumes&quot;.
                        </td>
                      </tr>
                    ) : visibleMatches.length === 0 ? (
                      <tr>
                        <td colSpan={MATCH_TABLE_COLS} className="px-3 py-8 text-center text-slate-500">
                          No candidates match “AI shortlist only”. Turn off the filter or run analyze.
                        </td>
                      </tr>
                    ) : (
                      visibleMatches.map((m) => {
                        const headlineScore =
                          m.ai_rerank_score ??
                          m.match_score_no_ai ??
                          m.match_score;
                        const tier =
                          m.ai_rerank_score != null
                            ? fitTierFromScore(m.ai_rerank_score)
                            : m.match_breakdown?.ai_fit_tier ?? fitTierFromScore(m.match_score);
                        const tierClass =
                          tier === "Strong Fit"
                            ? "bg-emerald-100 text-emerald-900"
                            : tier === "Potential"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-200 text-slate-800";
                        return (
                        <Fragment key={m.candidate_id}>
                          <tr className="group border-t border-slate-100 hover:bg-slate-50/80">
                            <td className="sticky left-0 z-10 w-12 bg-white px-3 py-2 group-hover:bg-slate-50/80">
                              <input
                                type="checkbox"
                                disabled={m.already_applied}
                                checked={selected.has(m.candidate_id)}
                                onChange={() => toggle(m.candidate_id)}
                              />
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-slate-700">
                              <div className="font-semibold text-slate-900">
                                #
                                {m.ai_rerank_rank != null
                                  ? m.ai_rerank_rank
                                  : m.no_ai_rank != null
                                    ? m.no_ai_rank
                                    : m.match_breakdown?.ai_match_rank != null
                                      ? m.match_breakdown.ai_match_rank
                                      : "—"}
                              </div>
                              {effectiveAiShortlistIds.has(m.candidate_id) ? (
                                <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                                  {hasHybridTop10 ? "Hybrid Top 10" : "Shortlisted"}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={[
                                  "inline-flex rounded-full px-2 py-0.5 text-xs font-bold",
                                  headlineScore >= 80
                                    ? "bg-emerald-100 text-emerald-800"
                                    : headlineScore >= 50
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-100 text-slate-700",
                                ].join(" ")}
                              >
                                {headlineScore}%
                              </span>
                              <span className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierClass}`}>
                                {tier}
                              </span>
                              {m.match_breakdown?.version === 2 && m.match_breakdown.ai_score != null ? (
                                <div className="mt-0.5 text-[10px] text-slate-500">
                                  R{m.match_breakdown.rule_score ?? "—"} · AI{m.match_breakdown.ai_score}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-slate-700">
                              <div>
                                {m.match_score_no_ai != null ? (
                                  <span className="font-semibold text-violet-900">{m.match_score_no_ai}%</span>
                                ) : (
                                  "—"
                                )}
                              </div>
                              {noAiTopIds.has(m.candidate_id) ? (
                                <span className="mt-1 inline-block max-w-[7rem] rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold leading-tight text-violet-900">
                                  Fast Mode (No AI)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-700">
                              {m.hire_probability != null ? `${m.hire_probability}%` : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {m.decision_no_ai ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${noAiDecisionBadgeClass(
                                    m.decision_no_ai
                                  )}`}
                                >
                                  {m.decision_no_ai}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-slate-600">
                              {m.no_ai_rank != null ? <span className="font-semibold">#{m.no_ai_rank}</span> : "—"}
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-indigo-900">
                              {m.ai_rerank_rank != null ? <span className="font-semibold">#{m.ai_rerank_rank}</span> : "—"}
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-indigo-900">
                              {m.ai_rerank_score != null ? `${m.ai_rerank_score}%` : "—"}
                            </td>
                            <td className="px-3 py-2 align-top text-xs">
                              {m.ai_rerank_decision ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${noAiDecisionBadgeClass(
                                    m.ai_rerank_decision
                                  )}`}
                                >
                                  {m.ai_rerank_decision}
                                </span>
                              ) : (
                                "—"
                              )}
                              {m.ai_rerank_reason ? (
                                <div className="mt-1 line-clamp-2 text-[10px] text-slate-500" title={m.ai_rerank_reason}>
                                  {m.ai_rerank_reason}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900">{m.full_name}</div>
                              <div className="text-xs text-slate-500">{m.email}</div>
                              {m.notice_period ? (
                                <div className="text-[11px] text-slate-500">Notice: {m.notice_period}</div>
                              ) : null}
                            </td>
                            <td className="max-w-[200px] px-3 py-2 text-xs text-slate-600">
                              <span className="line-clamp-3">{m.matched_skills || "—"}</span>
                            </td>
                            <td className="max-w-[180px] px-3 py-2 text-xs text-rose-700">
                              <span className="line-clamp-2">{m.missing_must_have || "—"}</span>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {m.already_applied ? (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">
                                  {m.application_stage || "In pipeline"}
                                </span>
                              ) : (
                                <span className="text-slate-400">Not applied</span>
                              )}
                            </td>
                            <td className="sticky right-24 z-10 w-24 bg-white px-3 py-2 group-hover:bg-slate-50/80">
                              <button
                                type="button"
                                className="text-xs font-semibold text-indigo-700 hover:underline"
                                onClick={() =>
                                  setDetailCandidateId((id) => (id === m.candidate_id ? null : m.candidate_id))
                                }
                              >
                                {detailCandidateId === m.candidate_id ? "Hide" : "Show"}
                              </button>
                            </td>
                            <td className="sticky right-0 z-10 w-24 bg-white px-3 py-2 group-hover:bg-slate-50/80">
                              <Link
                                href={`/candidates/${m.candidate_id}`}
                                className="text-xs font-semibold text-blue-700 hover:underline"
                              >
                                Profile
                              </Link>
                            </td>
                          </tr>
                          {detailCandidateId === m.candidate_id && m.match_breakdown?.version === 2 ? (
                            <tr className="border-t border-slate-100 bg-slate-50/90">
                              <td colSpan={MATCH_TABLE_COLS} className="px-4 py-3 text-xs text-slate-700">
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    {m.match_breakdown.scoring_mode === "ai_primary" && m.match_breakdown.ai_score != null ? (
                                      <>
                                        <div className="font-semibold text-slate-900">Rule-based skill fit (reference)</div>
                                        <p className="mt-1 text-slate-600">
                                          Primary match % is <span className="font-semibold text-indigo-800">AI-driven</span> (semantic JD↔resume). Keyword rule scores below are not used for the headline %.
                                        </p>
                                        <ul className="mt-1 list-inside list-disc text-slate-400">
                                          <li>Skills: {m.match_breakdown.skills_component ?? "—"}</li>
                                          <li>Experience: {m.match_breakdown.experience_component ?? "—"}</li>
                                          <li>Title overlap: {m.match_breakdown.title_component ?? "—"}</li>
                                          <li>Location: {m.match_breakdown.location_component ?? "—"}</li>
                                          <li>Bonus: {m.match_breakdown.bonus_component ?? "—"}</li>
                                        </ul>
                                      </>
                                    ) : m.match_breakdown.scoring_mode === "quick_filter" ? (
                                      <>
                                        <div className="font-semibold text-slate-900">Fast pre-filter (no AI)</div>
                                        <p className="mt-1 text-slate-600">
                                          Headline % uses a <span className="font-semibold">quick heuristic</span> (JD keyword overlap, domain terms, rough experience). Full rule weights are not applied; this row was not sent to the semantic model (outside the top pre-filter pool).
                                        </p>
                                        <ul className="mt-1 list-inside list-disc text-slate-500">
                                          <li>Heuristic composite (0–100): {m.match_breakdown.skills_component ?? "—"}</li>
                                        </ul>
                                      </>
                                    ) : m.match_breakdown.scoring_mode === "embedding_rank" ? (
                                      <>
                                        <div className="font-semibold text-slate-900">Vector similarity (pgvector)</div>
                                        <p className="mt-1 text-slate-600">
                                          Headline % comes from <span className="font-semibold">embedding cosine distance</span> vs the cached job vector. No pairwise rerank or narrative LLM ran for this candidate on this job run.
                                        </p>
                                        <ul className="mt-1 list-inside list-disc text-slate-500">
                                          <li>Similarity score (0–100): {m.match_breakdown.skills_component ?? "—"}</li>
                                        </ul>
                                      </>
                                    ) : m.match_breakdown.scoring_mode === "pair_rerank" ? (
                                      <>
                                        <div className="font-semibold text-slate-900">Pairwise rerank (mini LLM)</div>
                                        <p className="mt-1 text-slate-600">
                                          Score from a <span className="font-semibold">single batched JD↔snippet</span> model call (cross-encoder style). Full narrative is reserved for the global top pool only.
                                        </p>
                                        <ul className="mt-1 list-inside list-disc text-slate-500">
                                          <li>Rerank score (0–100): {m.match_breakdown.skills_component ?? "—"}</li>
                                        </ul>
                                      </>
                                    ) : (
                                      <>
                                        <div className="font-semibold text-slate-900">Weighted rule components (0–100)</div>
                                        <ul className="mt-1 list-inside list-disc text-slate-600">
                                          <li>Skills: {m.match_breakdown.skills_component ?? "—"}</li>
                                          <li>Experience: {m.match_breakdown.experience_component ?? "—"}</li>
                                          <li>Title overlap: {m.match_breakdown.title_component ?? "—"}</li>
                                          <li>Location: {m.match_breakdown.location_component ?? "—"}</li>
                                          <li>Bonus (extra fit): {m.match_breakdown.bonus_component ?? "—"}</li>
                                        </ul>
                                      </>
                                    )}
                                    <div className="mt-1 text-slate-500">
                                      JD exp: {m.match_breakdown.job_experience_label || "—"} · Cand. yrs (est.):{" "}
                                      {m.match_breakdown.candidate_years_estimated ?? "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-slate-900">AI layer</div>
                                    {m.match_breakdown.ai_score != null ? (
                                      <>
                                        <p className="mt-1 text-slate-600">
                                          {m.match_breakdown.scoring_mode === "ai_primary" ? (
                                            <>
                                              <span className="font-semibold text-indigo-800">100% AI</span> headline score →{" "}
                                              <span className="font-bold">{m.match_breakdown.hybrid_score ?? m.match_score}%</span>
                                            </>
                                          ) : (
                                            <>
                                              Hybrid: {Math.round((m.match_breakdown.hybrid_weights?.rule ?? 0.25) * 100)}% rule +{" "}
                                              {Math.round((m.match_breakdown.hybrid_weights?.ai ?? 0.75) * 100)}% AI →{" "}
                                              <span className="font-bold">{m.match_breakdown.hybrid_score ?? m.match_score}%</span>
                                            </>
                                          )}
                                          {m.match_breakdown.ai_recruiter_decision ? (
                                            <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-900">
                                              {m.match_breakdown.ai_recruiter_decision}
                                            </span>
                                          ) : null}
                                        </p>
                                        {m.match_breakdown.ai_candidate_name ? (
                                          <p className="mt-1 text-slate-500">Evaluated as: {m.match_breakdown.ai_candidate_name}</p>
                                        ) : null}
                                        {m.match_breakdown.ai_decision_reason ? (
                                          <div className="mt-2">
                                            <div className="font-medium text-slate-800">Decision reason</div>
                                            <p className="mt-0.5 rounded-lg border border-slate-200 bg-white p-2 text-slate-700">
                                              {m.match_breakdown.ai_decision_reason}
                                            </p>
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_recruiter_summary ? (
                                          <div className="mt-2">
                                            <div className="font-medium text-slate-800">Recruiter summary</div>
                                            <p className="mt-0.5 text-slate-700">{m.match_breakdown.ai_recruiter_summary}</p>
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_category_scores ? (
                                          <ul className="mt-2 list-inside list-disc text-slate-600">
                                            <li>Domain: {m.match_breakdown.ai_category_scores.domain_relevance}</li>
                                            <li>Core skills: {m.match_breakdown.ai_category_scores.core_skills}</li>
                                            <li>Business impact: {m.match_breakdown.ai_category_scores.business_impact}</li>
                                            <li>Stakeholder mgmt: {m.match_breakdown.ai_category_scores.stakeholder_management}</li>
                                            <li>Advanced analytics: {m.match_breakdown.ai_category_scores.advanced_analytics}</li>
                                            <li>Tools / tech: {m.match_breakdown.ai_category_scores.tools_tech}</li>
                                            <li>Experience: {m.match_breakdown.ai_category_scores.experience}</li>
                                            <li className="list-none text-[11px] text-slate-400">
                                              Category rubric: domain 25%, core 20%, impact 15%, stakeholder 15%, adv. analytics 10%, tools 10%, experience 5%.
                                            </li>
                                          </ul>
                                        ) : null}
                                        {m.match_breakdown.ai_parsed_profile ? (
                                          <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/80 p-2 text-xs text-slate-700">
                                            <div className="font-semibold text-indigo-900">Parsed evidence (semantic)</div>
                                            <div className="mt-1">
                                              <span className="font-medium">JD themes: </span>
                                              {m.match_breakdown.ai_parsed_profile.jd_primary_themes.join("; ") || "—"}
                                            </div>
                                            <div className="mt-1">
                                              <span className="font-medium">Resume domain: </span>
                                              {m.match_breakdown.ai_parsed_profile.resume_domain_evidence.join("; ") || "—"}
                                            </div>
                                            <div className="mt-1">
                                              <span className="font-medium">Impact: </span>
                                              {m.match_breakdown.ai_parsed_profile.impact_evidence.join("; ") || "—"}
                                            </div>
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_responsibility_comparison?.length ? (
                                          <div className="mt-2">
                                            <div className="font-medium text-slate-800">JD ↔ resume (≥3 themes)</div>
                                            <ul className="mt-1 list-inside list-disc text-slate-600">
                                              {m.match_breakdown.ai_responsibility_comparison.map((line, i) => (
                                                <li key={i}>{line}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_strengths?.length ? (
                                          <div className="mt-2 text-emerald-900">
                                            <span className="font-semibold">Strengths: </span>
                                            {m.match_breakdown.ai_strengths.join("; ")}
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_gaps?.length ? (
                                          <div className="mt-2 text-amber-900">
                                            <span className="font-semibold">Gaps: </span>
                                            {m.match_breakdown.ai_gaps.join("; ")}
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_risk_flags?.length ? (
                                          <div className="mt-2 text-rose-900">
                                            <span className="font-semibold">Risks: </span>
                                            {m.match_breakdown.ai_risk_flags.join("; ")}
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_reasoning &&
                                        !(m.match_breakdown.ai_decision_reason && m.match_breakdown.ai_recruiter_summary) ? (
                                          <p className="mt-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-700">
                                            {m.match_breakdown.ai_reasoning}
                                          </p>
                                        ) : null}
                                        {m.match_breakdown.ai_matched_skills?.length ? (
                                          <div className="mt-1">
                                            <span className="font-medium text-emerald-800">AI matched: </span>
                                            {m.match_breakdown.ai_matched_skills.join(", ")}
                                          </div>
                                        ) : null}
                                        {m.match_breakdown.ai_missing_skills?.length ? (
                                          <div className="mt-1">
                                            <span className="font-medium text-rose-800">AI gaps: </span>
                                            {m.match_breakdown.ai_missing_skills.join(", ")}
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <p className="mt-1 text-slate-500">
                                        {m.match_breakdown.scoring_mode === "quick_filter"
                                          ? "Not evaluated by semantic AI for this run — fast pre-filter only (outside top-N pool)."
                                          : m.match_breakdown.scoring_mode === "embedding_rank"
                                            ? "No narrative LLM — embedding-only score for this row."
                                            : m.match_breakdown.scoring_mode === "pair_rerank"
                                              ? "Narrative LLM not run — pairwise rerank score only."
                                              : "No AI score stored (rule-only run)."}
                                      </p>
                                    )}
                                    {m.match_breakdown.penalties?.length ? (
                                      <div className="mt-2 text-amber-900">
                                        <span className="font-semibold">Penalties: </span>
                                        {m.match_breakdown.penalties.join("; ")}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                {m.match_breakdown.summary?.length ? (
                                  <div className="mt-2 border-t border-slate-200 pt-2 text-slate-600">
                                    {m.match_breakdown.summary.map((s, i) => (
                                      <div key={i}>{s}</div>
                                    ))}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                        );
                      })
                    )}
                  </tbody>
                  </table>
                </div>
              </div>
            </div>
            ) : null}
          </div>
      </div>
    </div>
    <SingleMatchCheckModal
      jobId={job.id}
      open={singleCheckOpen}
      onClose={() => setSingleCheckOpen(false)}
      onHistorySaved={loadSingleMatchHistoryOnly}
    />
    </>
  );
}
