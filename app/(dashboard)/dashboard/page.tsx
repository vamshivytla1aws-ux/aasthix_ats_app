"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";
import { APP_CONFIG } from "@/lib/config";
import { UI } from "@/lib/ui";
import Link from "next/link";
import { Activity, ArrowRight, BriefcaseBusiness, Clock3, UsersRound } from "lucide-react";
import AccessGate from "@/components/AccessGate";
import HrAssistantPanel from "@/components/hrAssistant/HrAssistantPanel";

type Stage = "Applied" | "Screening" | "Screening Failed" | "Interview" | "Selected" | "Rejected";
const STAGES: Stage[] = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"];

type Job = { id: number; status?: string | null };
type Candidate = { id: number };
type Application = { id: number; stage: Stage };
type InterviewAlert = {
  id: number;
  type: "ongoing" | "upcoming";
  candidate_full_name: string;
  interview_datetime: string | null;
  message: string;
};

function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 6a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v1h4a2 2 0 0 1 2 2v3.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2h4V6Zm2 1h2V6a1 1 0 0 0-1-1h0a1 1 0 0 0-1 1v1Z"
        className="fill-current"
        opacity="0.95"
      />
      <path
        d="M3 14.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5A4.98 4.98 0 0 1 18 16H6a4.98 4.98 0 0 1-3-1.5Z"
        className="fill-current"
        opacity="0.7"
      />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" className="fill-current" opacity="0.95" />
      <path d="M4 20a6 6 0 0 1 12 0v1H4v-1Z" className="fill-current" opacity="0.7" />
      <path
        d="M18.5 21v-1a7.98 7.98 0 0 0-2.17-5.52A5 5 0 0 1 21 19.5V21h-2.5Z"
        className="fill-current"
        opacity="0.55"
      />
    </svg>
  );
}

function IconLayers({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3 3.5 8 12 13l8.5-5L12 3Z"
        className="fill-current"
        opacity="0.95"
      />
      <path
        d="M3.5 12 12 17l8.5-5"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M3.5 16 12 21l8.5-5"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

function MetricCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  tone: "blue" | "green" | "purple";
  icon: React.ReactNode;
}) {
  const toneTop =
    tone === "blue"
      ? "border-t-indigo-600"
      : tone === "green"
        ? "border-t-emerald-600"
        : "border-t-violet-600";
  const toneGradient =
    tone === "blue"
      ? "bg-gradient-to-br from-indigo-50/80 to-white"
      : tone === "green"
        ? "bg-gradient-to-br from-emerald-50 to-white"
        : "bg-gradient-to-br from-violet-50 to-white";
  const toneIcon =
    tone === "blue"
      ? "text-indigo-700 bg-indigo-100/70"
      : tone === "green"
        ? "text-emerald-700 bg-emerald-100/70"
        : "text-violet-700 bg-violet-100/70";

  return (
    <div
      className={[
        "rounded-2xl border border-slate-200 border-t-4 p-6 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:scale-[1.01]",
        toneTop,
        toneGradient,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
        </div>
        <div className={["h-11 w-11 rounded-2xl grid place-items-center", toneIcon].join(" ")}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [alerts, setAlerts] = useState<InterviewAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [jData, cData, aData] = await Promise.all([
        apiFetchJson<Job[]>("/api/jobs"),
        apiFetchJson<Candidate[]>("/api/candidates"),
        apiFetchJson<Application[]>("/api/applications"),
      ]);
      setJobs(jData as Job[]);
      setCandidates(cData as Candidate[]);
      setApplications(aData as Application[]);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function loadAlerts() {
    try {
      const data = await apiFetchJson<{ alerts: InterviewAlert[] }>("/api/interviews/alerts");
      setAlerts(data.alerts || []);
    } catch {
      // keep dashboard functional even if alerts fail
    }
  }

  useEffect(() => {
    load();
    loadAlerts();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => loadAlerts(), 60_000);
    return () => clearInterval(timer);
  }, []);

  const perStage = useMemo(() => {
    const counts: Record<Stage, number> = {
      Applied: 0,
      Screening: 0,
      "Screening Failed": 0,
      Interview: 0,
      Selected: 0,
      Rejected: 0,
    };
    for (const a of applications) {
      if (STAGES.includes(a.stage)) counts[a.stage] += 1;
    }
    return counts;
  }, [applications]);

  const openJobs = useMemo(
    () => jobs.filter((j) => (j.status || "Open").toLowerCase().includes("open")).length,
    [jobs]
  );
  const closedJobs = Math.max(0, jobs.length - openJobs);
  const conversionRate = applications.length
    ? Math.round((perStage.Selected / applications.length) * 100)
    : 0;
  const interviewLoad = perStage.Interview;
  const alertSummary = useMemo(() => {
    const ongoing = alerts.filter((a) => a.type === "ongoing").length;
    const upcoming = alerts.filter((a) => a.type === "upcoming").length;
    return { ongoing, upcoming };
  }, [alerts]);

  return (
    <AccessGate permissionKey="dashboard.view">
      <div className={["space-y-6", UI.pageShell].join(" ")}>
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring p-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <div className="text-sm text-slate-600">{APP_CONFIG.appName} overview metrics</div>
        </div>
        <button onClick={load} className={UI.secondaryButton}>
          Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="h-4 w-28 rounded bg-slate-200 animate-pulse" />
              <div className="mt-3 h-8 w-16 rounded bg-slate-200 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <MetricCard
              title="Total jobs"
              value={jobs.length}
              tone="blue"
              icon={<IconBriefcase className="h-6 w-6" />}
            />
            <MetricCard
              title="Total candidates"
              value={candidates.length}
              tone="green"
              icon={<IconUsers className="h-6 w-6" />}
            />
            <MetricCard
              title="Total applications"
              value={applications.length}
              tone="purple"
              icon={<IconLayers className="h-6 w-6" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring p-4">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <BriefcaseBusiness className="h-4 w-4 text-indigo-600" />
                Job Health
              </div>
              <div className="mt-2 text-sm text-slate-700">Open: <span className="font-semibold">{openJobs}</span></div>
              <div className="text-sm text-slate-700">Closed: <span className="font-semibold">{closedJobs}</span></div>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring p-4">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Activity className="h-4 w-4 text-violet-600" />
                Funnel Conversion
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{conversionRate}%</div>
              <div className="text-xs text-slate-500">Selected / total applications</div>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring p-4">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Clock3 className="h-4 w-4 text-amber-600" />
                Interview Load
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{interviewLoad}</div>
              <div className="text-xs text-slate-500">Candidates currently in interview stage</div>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring p-4">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <UsersRound className="h-4 w-4 text-emerald-600" />
                Interview Alerts
              </div>
              <div className="mt-2 text-sm text-slate-700">Ongoing: <span className="font-semibold">{alertSummary.ongoing}</span></div>
              <div className="text-sm text-slate-700">Upcoming 1h: <span className="font-semibold">{alertSummary.upcoming}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-600">Candidates per stage</div>
                <div className="text-xs text-slate-500">
                  Based on applications grouped by current stage
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {STAGES.map((s) => (
                <div key={s} className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs font-medium text-slate-600">{s}</div>
                  <div className="mt-1 text-2xl font-semibold">{perStage[s]}</div>
                </div>
              ))}
            </div>
          </div>

          <HrAssistantPanel />

          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring p-5">
            <div className="mb-3 text-sm font-semibold text-slate-900">Quick Actions</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/jobs" className="group rounded-xl border border-slate-200/90 bg-white p-3 shadow-ats-sm transition hover:border-indigo-200 hover:bg-indigo-50/50">
                <div className="text-sm font-semibold text-slate-900">Create Job</div>
                <div className="mt-1 text-xs text-slate-500">Add a new role to your hiring plan</div>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
              <Link href="/candidates" className="group rounded-xl border border-slate-200/90 bg-white p-3 shadow-ats-sm transition hover:border-indigo-200 hover:bg-indigo-50/50">
                <div className="text-sm font-semibold text-slate-900">Add Candidate</div>
                <div className="mt-1 text-xs text-slate-500">Create or import candidate profile</div>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
              <Link href="/pipeline" className="group rounded-xl border border-slate-200/90 bg-white p-3 shadow-ats-sm transition hover:border-indigo-200 hover:bg-indigo-50/50">
                <div className="text-sm font-semibold text-slate-900">Manage Pipeline</div>
                <div className="mt-1 text-xs text-slate-500">Move candidates across stages</div>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
              <Link href="/interviews" className="group rounded-xl border border-slate-200/90 bg-white p-3 shadow-ats-sm transition hover:border-indigo-200 hover:bg-indigo-50/50">
                <div className="text-sm font-semibold text-slate-900">Interview Desk</div>
                <div className="mt-1 text-xs text-slate-500">Monitor upcoming and ongoing interviews</div>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
      </div>
    </AccessGate>
  );
}

