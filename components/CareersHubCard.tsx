"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, LineChart, Megaphone } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";

type AnalyticsResponse =
  | {
      isCareersPublisher: true;
      windowDays: number;
      summary: {
        jd_views: number;
        apply_starts: number;
        funnel_submits: number;
        applications_recorded: number;
        conversion_rate: number | null;
      };
      applicationsByJob: Array<{ job_id: number; job_title: string; applications: number }>;
    }
  | { isCareersPublisher: false; message?: string };

export default function CareersHubCard() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetchJson<AnalyticsResponse>("/api/careers/analytics?days=30");
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Could not load careers analytics");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) return null;
  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (!data.isCareersPublisher) {
    return (
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Public careers portal</h2>
              <p className="mt-1 max-w-xl text-xs text-slate-600">
                Share a branded hiring page with candidates. Set <code className="rounded bg-slate-100 px-1">CAREERS_PUBLISHER_USER_ID</code>{" "}
                in server env to your user id, run migration <code className="rounded bg-slate-100 px-1">0037</code>, then open{" "}
                <span className="font-medium">/careers</span> (public, no login).
              </p>
            </div>
          </div>
          <Link
            href="/careers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
          >
            Preview portal
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const s = data.summary;
  const conv =
    s.conversion_rate == null ? "—" : `${s.conversion_rate}%`;

  return (
    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/70 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <LineChart className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Careers portal (last {data.windowDays} days)</h2>
            <p className="mt-1 text-xs text-slate-600">
              JD views: <span className="font-medium text-slate-800">{s.jd_views}</span> · Apply starts:{" "}
              <span className="font-medium text-slate-800">{s.apply_starts}</span> · Applications (source Careers Page):{" "}
              <span className="font-medium text-slate-800">{s.applications_recorded}</span> · Conversion (apps / JD views):{" "}
              <span className="font-medium text-emerald-800">{conv}</span>
            </p>
            {data.applicationsByJob.length > 0 ? (
              <ul className="mt-2 max-h-24 overflow-y-auto text-xs text-slate-600">
                {data.applicationsByJob.slice(0, 6).map((row) => (
                  <li key={row.job_id}>
                    <span className="font-medium text-slate-800">{row.applications}</span> · {row.job_title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No careers-sourced applications in this window yet.</p>
            )}
          </div>
        </div>
        <Link
          href="/careers"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50"
        >
          Open public page
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
