"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import AccessGate from "@/components/AccessGate";
import { AlertTriangle, Briefcase, Calendar, Sparkles, UserX } from "lucide-react";

type StuckRow = {
  id: number;
  stage: string;
  updated_at: string;
  full_name: string;
  job_title: string;
  job_id: number;
};

type ThinJob = { id: number; title: string; company: string; app_count: number };

type Rediscovery = { job_id: number; job_title: string; strong_matches: number };

export default function RecruiterCopilotPage() {
  const [data, setData] = useState<{
    stuck_candidates: StuckRow[];
    open_jobs_low_pipeline: ThinJob[];
    rediscovery: Rediscovery[];
    interviews_today: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetchJson<{
          stuck_candidates: StuckRow[];
          open_jobs_low_pipeline: ThinJob[];
          rediscovery: Rediscovery[];
          interviews_today: number;
        }>("/api/recruiter/copilot");
        setData(res);
      } catch (e: any) {
        setError(e?.message || "Failed to load copilot");
      }
    })();
  }, []);

  return (
    <AccessGate permissionKey="jobs.view">
      <div className={["space-y-6", UI.pageShell].join(" ")}>
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8 shrink-0 opacity-90" />
            <div>
              <h1 className="text-2xl font-bold">Recruiter Copilot</h1>
              <p className="mt-1 text-sm text-white/90">
                Daily priorities: stuck candidates, thin pipelines, and strong matches already in your database.
              </p>
            </div>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

        {!data ? (
          <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">Loading assistant…</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Calendar className="h-4 w-4 text-blue-600" />
                Interviews today
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-900">{data.interviews_today}</div>
              <Link href="/interviews" className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline">
                Open interview board →
              </Link>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <UserX className="h-4 w-4" />
                Stuck in pipeline (&gt;7 days no update)
              </div>
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
                {data.stuck_candidates.length === 0 ? (
                  <li className="text-slate-600">None — great job keeping momentum.</li>
                ) : (
                  data.stuck_candidates.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2">
                      <span className="font-medium text-slate-900">{s.full_name}</span>
                      <span className="text-xs text-slate-500">
                        {s.job_title} · {s.stage}
                      </span>
                      <Link href="/pipeline" className="text-xs font-semibold text-blue-700 hover:underline">
                        Pipeline
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Briefcase className="h-4 w-4 text-emerald-600" />
                Open roles — thin pipeline
              </div>
              <p className="mt-1 text-xs text-slate-500">Fewer than 3 applications — time to source or widen reach.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {data.open_jobs_low_pipeline.length === 0 ? (
                  <li className="text-slate-600">All tracked roles have healthy volume.</li>
                ) : (
                  data.open_jobs_low_pipeline.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                      <span>
                        <Link href={`/jobs/${j.id}`} className="font-medium text-blue-700 hover:underline">
                          {j.title}
                        </Link>
                        <span className="text-slate-500"> — {j.company}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{j.app_count} apps</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
                <AlertTriangle className="h-4 w-4" />
                Rediscovery — strong DB matches not yet in pipeline
              </div>
              <p className="mt-1 text-xs text-indigo-800/80">
                After running JD skill extract on jobs, we surface ≥70% skill matches who are not yet applied.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {data.rediscovery.length === 0 ? (
                  <li className="text-slate-600">No rows yet — extract skills from job JDs on the Jobs board.</li>
                ) : (
                  data.rediscovery.map((r) => (
                    <li key={r.job_id} className="flex items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2">
                      <Link href={`/jobs/${r.job_id}`} className="font-medium text-indigo-800 hover:underline">
                        {r.job_title}
                      </Link>
                      <span className="shrink-0 font-bold text-indigo-700">{r.strong_matches} matches</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </AccessGate>
  );
}
