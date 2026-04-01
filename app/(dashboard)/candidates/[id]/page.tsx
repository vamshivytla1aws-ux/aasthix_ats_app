"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, Mail, Phone } from "lucide-react";
import CandidateHeader from "@/components/candidate/CandidateHeader";
import Timeline from "@/components/candidate/Timeline";
import NotesSection from "@/components/candidate/NotesSection";
import JobInfo from "@/components/candidate/JobInfo";
import { apiFetchJson } from "@/lib/apiClient";
import EnterpriseTabs from "@/components/enterprise/EnterpriseTabs";
import { UI } from "@/lib/ui";
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
  skills: string | null;
  current_salary: number | null;
  expected_salary: number | null;
  notice_period: string | null;
  status: "Active" | "Placed";
  resume_url: string | null;
  job_title: string | null;
  stage: string | null;
};

type TimelineItem = {
  id: number;
  type: "Applied" | "Interview" | "Selected" | "Rejected" | "Screening" | "Screening Failed";
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
};

const TABS = [
  { id: "details", label: "Details" },
  { id: "screening", label: "Screening" },
  { id: "messages", label: "Messages" },
  { id: "activity", label: "Activity" },
  { id: "interviews", label: "Interviews" },
  { id: "feedback", label: "Feedback" },
  { id: "similar", label: "Similar" },
] as const;

export default function CandidateProfilePage() {
  const params = useParams<{ id: string }>();
  const candidateId = Number(params?.id);
  const { density, setDensity } = useDensity("candidate_profile_density", "compact");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CandidateProfileResponse | null>(null);
  const [tab, setTab] = useState<string>("details");

  const isValidId = useMemo(() => Number.isFinite(candidateId), [candidateId]);

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
        const res = await apiFetchJson<CandidateProfileResponse>(`/api/candidates/${candidateId}`);
        setData(res);
      } catch (err: any) {
        setError(err.message || "Failed to load candidate profile");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [candidateId, isValidId]);

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
  const stageLabel = c.stage || "Applied";

  const detailsPanel = (
    <div className="space-y-0">
      <CandidateHeader candidate={c} density={density} />
      <div className={[`border-b border-slate-200 dark:border-slate-700`, sectionPad].join(" ")}>
        <div className={["mb-0.5 text-slate-500 dark:text-slate-400", titleClass].join(" ")}>Resume</div>
        {c.resume_url ? (
          <a href={c.resume_url} target="_blank" rel="noopener noreferrer" className={btnClass}>
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
          <div>
            <span className="text-slate-500 dark:text-slate-400">Location:</span> {c.location || "—"}
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/candidates" className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">
          ← Candidates
        </Link>
        <DensityToggle density={density} onChange={setDensity} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        {/* Left summary — sticky on large screens */}
        <aside className={`${UI.enterprise.elevatedCard} p-4 lg:sticky lg:top-24 lg:col-span-4`}>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{c.name}</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{c.job_title || "Role not set"}</p>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span>Progress</span>
              <span>{stageLabel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500"
                style={{ width: c.stage?.toLowerCase().includes("offer") ? "90%" : c.stage?.toLowerCase().includes("interview") ? "60%" : "25%" }}
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
        </aside>

        {/* Right workspace */}
        <section className="min-w-0 lg:col-span-8">
          <div className={`${UI.enterprise.elevatedCard} overflow-hidden`}>
            <EnterpriseTabs tabs={[...TABS]} active={tab} onChange={setTab} />
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4">
              {tab === "details" ? detailsPanel : null}
              {tab === "screening" ? screeningPanel : null}
              {tab === "messages" ? <NotesSection candidateId={c.id} initialNotes={data.notes} density={density} /> : null}
              {tab === "activity" ? <Timeline items={data.timeline} density={density} /> : null}
              {tab === "interviews" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm dark:border-slate-600 dark:bg-slate-950/30">
                  <p className="text-slate-600 dark:text-slate-400">Schedule and manage interviews from the Interviews workspace.</p>
                  <Link href="/interviews" className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
                    Open interviews →
                  </Link>
                </div>
              ) : null}
              {tab === "feedback" ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Structured feedback forms — coming soon.</p>
              ) : null}
              {tab === "similar" ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Similar candidate suggestions — coming soon.</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
