"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, Download, Mail, MapPin, Pencil, Phone, X } from "lucide-react";
import CandidateHeader from "@/components/candidate/CandidateHeader";
import Timeline from "@/components/candidate/Timeline";
import NotesSection from "@/components/candidate/NotesSection";
import JobInfo from "@/components/candidate/JobInfo";
import { apiFetchJson } from "@/lib/apiClient";
import EnterpriseTabs from "@/components/enterprise/EnterpriseTabs";
import NextBestActionStrip from "@/components/enterprise/NextBestActionStrip";
import ContextualCopilotPanel from "@/components/enterprise/ContextualCopilotPanel";
import { UI } from "@/lib/ui";
import { normalizeResumeLink } from "@/lib/resumeLink";
import { useDensity } from "@/lib/useDensity";
import DensityToggle from "@/components/ui/DensityToggle";

type Candidate = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  location: string | null;
  location_source?: "parsed" | "manual" | null;
  skills: string | null;
  current_salary: number | null;
  expected_salary: number | null;
  notice_period: string | null;
  status: "Active" | "Placed";
  resume_url: string | null;
  job_title: string | null;
  stage: string | null;
  current_interview_round_order?: number | null;
  current_interview_round_label?: string | null;
  interview_round_total?: number | null;
  interview_round_status?: string | null;
  interview_substatus?: "scheduled" | "completed_followup" | "no_show" | "cancelled" | null;
  interview_completed_at?: string | null;
  interview_status_note?: string | null;
  latest_application_id?: number | null;
  meet_link?: string | null;
  calendar_sync_status?: string | null;
  calendar_sync_error?: string | null;
  calendar_organizer_email?: string | null;
  onboarding_status?: string | null;
};

type TimelineItem = {
  id: number;
  type:
    | "Applied"
    | "Interview"
    | "Selected"
    | "Rejected"
    | "Screening"
    | "Screening Failed"
    | "stage_move"
    | "interview_schedule"
    | "interview_reschedule"
    | "invite_sent"
    | "interview_outcome"
    | "record_updated"
    | "onboarding_link_sent"
    | "onboarding_started"
    | "onboarding_submitted"
    | "onboarding_exported";
  description: string;
  created_at: string;
};

type NoteItem = {
  id: number;
  candidate_id: number;
  note: string;
  created_at: string;
};

type CandidateProfileResponse = {
  candidate: Candidate;
  timeline: TimelineItem[];
  notes: NoteItem[];
  onboarding_packets?: Array<{
    id: number;
    application_id: number;
    status: string;
    created_at: string;
    submitted_at: string | null;
    exported_at: string | null;
    job_title: string | null;
  }>;
  screeningEvaluation?: {
    test_id: number;
    application_id: number;
    status: string;
    stage: string | null;
    job_title: string | null;
    score: number | null;
    quality_flag: string | null;
    feedback: string | null;
    strengths: string | null;
    weaknesses: string | null;
    submitted_at: string | null;
    expires_at: string;
    answers: Array<{
      question_id: number;
      question_type: string;
      question_text: string;
      answer_text: string;
    }>;
  } | null;
  interviewRubricFeedback?: Array<{
    question_id: number;
    question: string;
    category: string;
    asked: boolean;
    notes: string | null;
    rating?: number | null;
  }>;
  dispositionFeedback?: Array<{
    id: number;
    label: string;
    notes: string | null;
    created_at: string;
    job_title: string | null;
  }>;
  similarJobMatches?: Array<{
    job_id: number;
    title: string;
    company: string | null;
    location: string | null;
    match_score: number;
    already_applied: boolean;
    application_stage: string | null;
    match_source?: "table" | "embedding";
  }>;
};

const TABS = [
  { id: "details", label: "Details" },
  { id: "screening", label: "Screening" },
  { id: "messages", label: "Messages" },
  { id: "activity", label: "Activity" },
  { id: "interviews", label: "Interviews" },
  { id: "feedback", label: "Feedback" },
  { id: "similar", label: "Similar" },
  { id: "onboarding", label: "Onboarding" },
] as const;

function CandidateProfilePageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const candidateId = Number(params?.id);
  const { density, setDensity } = useDensity("candidate_profile_density", "compact");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CandidateProfileResponse | null>(null);
  const [tab, setTab] = useState<string>("details");
  const [canManageCandidate, setCanManageCandidate] = useState(false);
  const [gdprBusy, setGdprBusy] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const router = useRouter();

  const isValidId = useMemo(() => Number.isFinite(candidateId), [candidateId]);

  /** Align Job info with pipeline when opened via ?application= or ?job_id= */
  const scopeQs = useMemo(() => {
    const app = searchParams.get("application") ?? searchParams.get("app");
    const jobId = searchParams.get("job_id");
    if (app != null && /^\d+$/.test(app.trim())) return `?application=${encodeURIComponent(app.trim())}`;
    if (jobId != null && /^\d+$/.test(jobId.trim())) return `?job_id=${encodeURIComponent(jobId.trim())}`;
    return "";
  }, [searchParams]);

  useEffect(() => {
    async function load() {
      if (!isValidId) {
        setError("Invalid candidate id");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await apiFetchJson<CandidateProfileResponse>(`/api/candidates/${candidateId}${scopeQs}`);
        setData(res);
      } catch (err: any) {
        setError(err.message || "Failed to load candidate profile");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [candidateId, isValidId, scopeQs]);

  useEffect(() => {
    let alive = true;
    apiFetchJson<{ user?: { role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me")
      .then((me) => {
        if (!alive) return;
        const admin = (me.user?.role || "").toLowerCase() === "admin";
        setCanManageCandidate(admin || me.permissions?.["candidates.manage"] !== false);
      })
      .catch(() => setCanManageCandidate(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setLocationDraft(data?.candidate.location || "");
    setIsEditingLocation(false);
    setLocationError(null);
  }, [data?.candidate.location, data?.candidate.id]);

  const sectionPad = density === "comfortable" ? "py-3" : density === "compact" ? "py-2" : "py-1.5";
  const titleClass = density === "ultra" ? "text-[10px]" : "text-xs";
  const btnClass =
    density === "comfortable"
      ? "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
      : density === "compact"
        ? "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-blue-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
        : "inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-blue-700 dark:bg-indigo-600 dark:hover:bg-indigo-500";
  const chipClass =
    density === "ultra"
      ? "rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      : "rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

  if (loading) {
    return (
      <div className="space-y-4">
        <div className={`${UI.enterprise.elevatedCard} p-6`}>
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading candidate profile…</div>
          <div className="mt-4 grid gap-2 lg:grid-cols-12">
            <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 lg:col-span-4" />
            <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 lg:col-span-8" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`${UI.enterprise.elevatedCard} p-6`}>
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Unable to load profile</div>
        <div className="mt-1 text-sm text-red-600 dark:text-red-400">{error || "Unknown error"}</div>
        <Link href="/candidates" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
          Back to candidates
        </Link>
      </div>
    );
  }

  const c = data.candidate;
  const normalizedResumeUrl = normalizeResumeLink(c.resume_url);
  const stageLabel = c.stage || "Applied";
  const stageProgressWidth =
    stageLabel === "Selected"
      ? "100%"
      : stageLabel === "Rejected" || stageLabel === "Screening Failed"
        ? "85%"
        : stageLabel === "Interview"
          ? "60%"
        : stageLabel === "Screening"
          ? "40%"
          : "20%";

  async function saveLocation() {
    setLocationBusy(true);
    setLocationError(null);
    try {
      const updated = await apiFetchJson<{ location: string | null; location_source?: "parsed" | "manual" | null }>(
        `/api/candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location: locationDraft }),
        }
      );
      setData((current) =>
        current
          ? {
              ...current,
              candidate: {
                ...current.candidate,
                location: updated.location ?? null,
                location_source: updated.location_source ?? null,
              },
            }
          : current
      );
      setLocationDraft(updated.location || "");
      setIsEditingLocation(false);
    } catch (err: any) {
      setLocationError(err?.message || "Failed to save location");
    } finally {
      setLocationBusy(false);
    }
  }

  const detailsPanel = (
    <div className="space-y-0">
      <CandidateHeader candidate={c} density={density} />
      <div className={[`border-b border-slate-200 dark:border-slate-700`, sectionPad].join(" ")}>
        <div className={["mb-0.5 text-slate-500 dark:text-slate-400", titleClass].join(" ")}>Resume</div>
        {normalizedResumeUrl ? (
          <a href={normalizedResumeUrl} target="_blank" rel="noopener noreferrer" className={btnClass}>
            <Download size={density === "ultra" ? 12 : 14} />
            Download resume
          </a>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400">No resume uploaded</div>
        )}
      </div>
      <div className={[`border-b border-slate-200 dark:border-slate-700`, sectionPad].join(" ")}>
        <h3 className={[titleClass, "text-slate-500 dark:text-slate-400"].join(" ")}>Skills</h3>
        {c.skills?.trim() ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {c.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((skill) => (
                <span key={skill} className={chipClass}>
                  {skill}
                </span>
              ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">No skills listed</p>
        )}
      </div>
      <div className={[`border-b border-slate-200 dark:border-slate-700`, sectionPad].join(" ")}>
        <h3 className={[titleClass, "text-slate-500 dark:text-slate-400"].join(" ")}>Details</h3>
        <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-slate-700 dark:text-slate-200 md:grid-cols-2">
          <div
            onDoubleClick={() => {
              setIsEditingLocation(true);
              setLocationError(null);
            }}
            title="Double-click to edit location"
          >
            <span className="text-slate-500 dark:text-slate-400">Location:</span> {c.location || "—"}
          </div>
          <div className="md:col-span-2">
            {isEditingLocation ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={locationDraft}
                  onChange={(e) => setLocationDraft(e.target.value)}
                  className="min-w-[220px] rounded-md border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1 text-xs text-[var(--ats-text)] outline-none"
                  placeholder="Enter candidate location"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveLocation();
                    }
                    if (e.key === "Escape") {
                      setLocationDraft(c.location || "");
                      setIsEditingLocation(false);
                      setLocationError(null);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void saveLocation()}
                  disabled={locationBusy}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <Check size={12} />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocationDraft(c.location || "");
                    setIsEditingLocation(false);
                    setLocationError(null);
                  }}
                  disabled={locationBusy}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <X size={12} />
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingLocation(true);
                    setLocationError(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1 text-[11px] font-medium text-[var(--ats-text)] transition hover:bg-[var(--ats-bg-elevated)]"
                >
                  <MapPin size={12} />
                  <Pencil size={12} />
                  Edit location
                </button>
                {c.location_source === "manual" ? (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    Manual override
                  </span>
                ) : null}
              </div>
            )}
            {locationError ? <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">{locationError}</div> : null}
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Notice:</span> {c.notice_period || "—"}
          </div>
          <div className="truncate md:col-span-2">
            <span className="text-slate-500 dark:text-slate-400">LinkedIn:</span>{" "}
            {c.linkedin_url ? (
              <a className="text-blue-700 hover:underline dark:text-blue-400" href={c.linkedin_url} target="_blank" rel="noreferrer">
                Link
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>
      <div className={sectionPad}>
        <JobInfo candidate={c} density={density} />
      </div>
    </div>
  );

  const screeningPanel =
    data.screeningEvaluation ? (
      <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
        <div>
          <span className="text-slate-500 dark:text-slate-400">Status:</span> {data.screeningEvaluation.status}
          {data.screeningEvaluation.stage ? ` (${data.screeningEvaluation.stage})` : ""}
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Score:</span> {data.screeningEvaluation.score ?? "Pending"} / 100
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Quality:</span> {data.screeningEvaluation.quality_flag ?? "Pending"}
        </div>
        {data.screeningEvaluation.feedback ? <div>{data.screeningEvaluation.feedback}</div> : null}
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-950/40">
          <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">Answers</div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {data.screeningEvaluation.answers.map((a, idx) => (
              <div key={a.question_id} className="rounded border border-slate-200 p-2 text-xs dark:border-slate-600">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Q{idx + 1} [{a.question_type}]
                </div>
                <div className="text-slate-700 dark:text-slate-300">{a.question_text}</div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">{a.answer_text || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ) : (
      <p className="text-sm text-slate-500 dark:text-slate-400">No screening evaluation yet.</p>
    );

  const rubricRaw = data.interviewRubricFeedback ?? [];
  const rubric = rubricRaw.filter(
    (row) =>
      row.asked ||
      (row.notes && row.notes.trim() !== "") ||
      (row.rating != null && row.rating >= 1 && row.rating <= 5)
  );
  const ratedOnly = rubricRaw.filter((r) => r.rating != null && r.rating >= 1 && r.rating <= 5);
  const scorecardAvg =
    ratedOnly.length > 0 ? ratedOnly.reduce((s, r) => s + (r.rating || 0), 0) / ratedOnly.length : null;
  const dispositions = data.dispositionFeedback ?? [];
  const hasScreeningFeedback =
    Boolean(data.screeningEvaluation?.feedback?.trim()) ||
    Boolean(data.screeningEvaluation?.strengths?.trim()) ||
    Boolean(data.screeningEvaluation?.weaknesses?.trim());
  const feedbackPanel = (
    <div className="space-y-6 text-sm text-slate-700 dark:text-slate-200">
      {hasScreeningFeedback || data.screeningEvaluation ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Screening</div>
            <button
              type="button"
              onClick={() => setTab("screening")}
              className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
            >
              Open screening tab →
            </button>
          </div>
          {data.screeningEvaluation?.job_title ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{data.screeningEvaluation.job_title}</div>
          ) : null}
          {data.screeningEvaluation?.feedback ? (
            <p className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{data.screeningEvaluation.feedback}</p>
          ) : null}
          {data.screeningEvaluation?.strengths ? (
            <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
              <span className="font-semibold">Strengths: </span>
              {data.screeningEvaluation.strengths}
            </p>
          ) : null}
          {data.screeningEvaluation?.weaknesses ? (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Gaps: </span>
              {data.screeningEvaluation.weaknesses}
            </p>
          ) : null}
          {!hasScreeningFeedback && data.screeningEvaluation ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">See the Screening tab for scores and answers.</p>
          ) : null}
        </div>
      ) : null}

      {scorecardAvg != null ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <span className="font-semibold text-indigo-900 dark:text-indigo-100">Rubric average: </span>
          <span className="text-indigo-800 dark:text-indigo-200">{scorecardAvg.toFixed(1)} / 5</span>
          <span className="text-xs text-indigo-700/80 dark:text-indigo-300/90"> ({ratedOnly.length} scored)</span>
        </div>
      ) : null}

      {rubric.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Interview scorecard</div>
          <ul className="space-y-3">
            {rubric.map((row) => (
              <li
                key={row.question_id}
                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900/40"
              >
                <div className="text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">{row.category}</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{row.question}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {row.rating != null && row.rating >= 1 ? (
                    <span className={chipClass}>
                      {row.rating}/5
                    </span>
                  ) : null}
                  {row.asked ? <span className={chipClass}>Asked</span> : null}
                  {row.notes ? <span className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">{row.notes}</span> : null}
                  {!row.asked && !row.notes && (row.rating == null || row.rating < 1) ? (
                    <span className="italic">No notes yet</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dispositions.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Disposition & outcomes</div>
          <ul className="space-y-2">
            {dispositions.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{d.label}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                {d.job_title ? <div className="text-xs text-slate-500 dark:text-slate-400">{d.job_title}</div> : null}
                {d.notes ? <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{d.notes}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!hasScreeningFeedback &&
      !data.screeningEvaluation &&
      rubric.length === 0 &&
      dispositions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No structured feedback yet. Screening scores, interview rubric notes, and disposition reasons appear here when recorded.
        </p>
      ) : null}
    </div>
  );

  const similar = data.similarJobMatches ?? [];
  const onboardingPackets = data.onboarding_packets ?? [];
  const similarPanel =
    similar.length > 0 ? (
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {similar.map((m) => (
          <li key={m.job_id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <Link
                href={`/jobs/${m.job_id}`}
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                {m.title}
              </Link>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {[m.company, m.location].filter(Boolean).join(" · ") || "—"}
              </div>
              {m.already_applied ? (
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Applied{m.application_stage ? ` · ${m.application_stage}` : ""}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={chipClass}>Match {m.match_score}%</span>
              {m.match_source === "embedding" ? (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Semantic (embedding)</span>
              ) : m.match_source === "table" ? (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Saved match</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <div className="text-sm text-slate-500 dark:text-slate-400">
        <p>
          No suggestions yet. Run job matching to populate scores, or ensure resume embeddings exist — we also surface semantic
          similar roles when vectors are available.
        </p>
        <Link href="/jobs" className="mt-3 inline-flex font-semibold text-blue-700 hover:underline dark:text-blue-400">
          Browse jobs →
        </Link>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/candidates" className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">
          ← Candidates
        </Link>
        <DensityToggle density={density} onChange={setDensity} />
      </div>

      <ContextualCopilotPanel scope="candidate" entityId={c.id} subtitle={c.name} />
      <NextBestActionStrip
        title="Next best actions"
        actions={[
          { label: "Open pipeline for this candidate", href: c.latest_application_id ? `/pipeline?application=${c.latest_application_id}` : "/pipeline" },
          { label: "Open interviews desk", href: "/interviews" },
          { label: "Review activity timeline", href: "#candidate-activity" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        {/* Left summary — sticky on large screens */}
        <aside className={`${UI.enterprise.elevatedCard} p-4 lg:sticky lg:top-24 lg:col-span-4`}>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{c.name}</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{c.job_title || "Role not set"}</p>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span>Pipeline stage</span>
              <span>{stageLabel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500"
                style={{ width: stageProgressWidth }}
              />
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-600">
            {c.email ? (
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-slate-700 hover:text-blue-700 dark:text-slate-200 dark:hover:text-blue-400">
                <Mail className="h-4 w-4 shrink-0 opacity-60" />
                <span className="truncate">{c.email}</span>
              </a>
            ) : null}
            {c.phone ? (
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <Phone className="h-4 w-4 shrink-0 opacity-60" />
                <span>{c.phone}</span>
              </div>
            ) : null}
          </div>
          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tags</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className={chipClass}>{c.status}</span>
              {c.stage ? <span className={chipClass}>{c.stage}</span> : null}
            </div>
          </div>
          {canManageCandidate ? (
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Data compliance
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                JSON export for portability; erasure removes the candidate and related applications. Obtain legal review before use in production.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={gdprBusy}
                  className={btnClass}
                  onClick={async () => {
                    setGdprBusy(true);
                    try {
                      const payload = await apiFetchJson<Record<string, unknown>>(`/api/candidates/${c.id}/gdpr`);
                      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `candidate-${c.id}-export.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      /* toast optional */
                    } finally {
                      setGdprBusy(false);
                    }
                  }}
                >
                  Download JSON export
                </button>
                <button
                  type="button"
                  disabled={gdprBusy}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
                  onClick={async () => {
                    if (!window.confirm("This permanently deletes this candidate and their applications. Continue?")) return;
                    const typed = window.prompt('Type the word ERASE to confirm permanent deletion.');
                    if (typed !== "ERASE") return;
                    setGdprBusy(true);
                    try {
                      await apiFetchJson(`/api/candidates/${c.id}/gdpr`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ confirm: "ERASE" }),
                      });
                      router.push("/candidates");
                    } catch {
                      /* */
                    } finally {
                      setGdprBusy(false);
                    }
                  }}
                >
                  Erase candidate
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        {/* Right workspace */}
        <section className="min-w-0 lg:col-span-8">
          <div className={`${UI.enterprise.elevatedCard} overflow-hidden`}>
            <EnterpriseTabs tabs={[...TABS]} active={tab} onChange={setTab} />
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4">
              {tab === "details" ? detailsPanel : null}
              {tab === "screening" ? screeningPanel : null}
              {tab === "messages" ? <NotesSection candidateId={c.id} initialNotes={data.notes} density={density} /> : null}
              {tab === "activity" ? (
                <div id="candidate-activity">
                  <Timeline items={data.timeline} density={density} />
                </div>
              ) : null}
              {tab === "interviews" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm dark:border-slate-600 dark:bg-slate-950/30">
                  <p className="text-slate-600 dark:text-slate-400">Schedule and manage interviews from the Interviews workspace.</p>
                  <Link href="/interviews" className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
                    Open interviews →
                  </Link>
                </div>
              ) : null}
              {tab === "feedback" ? feedbackPanel : null}
              {tab === "similar" ? similarPanel : null}
              {tab === "onboarding" ? (
                <div className="space-y-3">
                  {onboardingPackets.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-950/30 dark:text-slate-400">
                      No onboarding packet sent yet. Use Selected stage card action “Send onboarding link”.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {onboardingPackets.map((p) => (
                        <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900/40">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Packet #{p.id} · {p.job_title || "Role"}
                            </div>
                            <span className={chipClass}>{p.status}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Sent: {new Date(p.created_at).toLocaleString("en-IN")}
                            {p.submitted_at ? ` · Submitted: ${new Date(p.submitted_at).toLocaleString("en-IN")}` : ""}
                          </div>
                          <div className="mt-2">
                            <a
                              href={`/api/onboarding/${p.id}/export-pdf`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Export onboarding PDF
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function CandidateProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className={`${UI.enterprise.elevatedCard} p-6`}>
            <div className="text-sm text-slate-500 dark:text-slate-400">Loading candidate profile…</div>
            <div className="mt-4 grid gap-2 lg:grid-cols-12">
              <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 lg:col-span-4" />
              <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 lg:col-span-8" />
            </div>
          </div>
        </div>
      }
    >
      <CandidateProfilePageContent />
    </Suspense>
  );
}
