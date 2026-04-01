"use client";

import React, { useEffect, useState } from "react";
import AccessGate from "@/components/AccessGate";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import { BarChart3, Clock, RefreshCw, TrendingUp } from "lucide-react";

type Analytics = {
  summary: {
    pending: number;
    expired: number;
    submitted: number;
    total_tests: number;
    pass_rate_percent: number | null;
    avg_score_submitted: number | null;
    avg_seconds_to_submit: number | null;
    resend_count: number;
  };
  by_job: Array<{
    job_id: number;
    job_title: string;
    tests_count: number;
    submitted: number;
    passed: number;
    pass_rate_percent: number | null;
    avg_score: number | null;
  }>;
  pending_queue: Array<{
    test_id: number;
    application_id: number;
    candidate_name: string;
    job_title: string;
    expires_at: string;
  }>;
};

function formatDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export default function ScreeningAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchJson<Analytics>("/api/screening/analytics");
      setData(res);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AccessGate permissionKey="pipeline.view">
      <div className={["space-y-6", UI.pageShell].join(" ")}>
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Screening analytics</h1>
            <p className="mt-1 text-sm text-slate-600">
              Pass rates, scores by job, pending queue, resends, and time-to-submit.
            </p>
          </div>
          <button type="button" onClick={() => void load()} className={UI.secondaryButton}>
            <RefreshCw className="mr-2 inline h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                  <TrendingUp className="h-4 w-4" />
                  Pass rate
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {data.summary.pass_rate_percent == null ? "—" : `${data.summary.pass_rate_percent}%`}
                </div>
                <div className="text-xs text-slate-500">Submitted tests scoring ≥ 70</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                  <BarChart3 className="h-4 w-4" />
                  Avg score
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {data.summary.avg_score_submitted ?? "—"}
                </div>
                <div className="text-xs text-slate-500">Among submitted</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                  <Clock className="h-4 w-4" />
                  Avg time to submit
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {formatDuration(data.summary.avg_seconds_to_submit)}
                </div>
                <div className="text-xs text-slate-500">From invite to submit</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Resends</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{data.summary.resend_count}</div>
                <div className="text-xs text-slate-500">Recruiter resent test links</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
                <div className="text-sm font-semibold text-slate-900">Queue</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="text-xl font-bold text-amber-900">{data.summary.pending}</div>
                    <div className="text-[10px] font-semibold uppercase text-amber-800">Pending</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xl font-bold text-slate-900">{data.summary.expired}</div>
                    <div className="text-[10px] font-semibold uppercase text-slate-600">Expired</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <div className="text-xl font-bold text-emerald-900">{data.summary.submitted}</div>
                    <div className="text-[10px] font-semibold uppercase text-emerald-800">Done</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                <div className="text-sm font-semibold text-slate-900">By job</div>
                <div className="mt-3 max-h-64 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2 pr-2">Job</th>
                        <th className="py-2 pr-2">Tests</th>
                        <th className="py-2 pr-2">Pass %</th>
                        <th className="py-2">Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.by_job.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-slate-500">
                            No screening data yet.
                          </td>
                        </tr>
                      ) : (
                        data.by_job.map((j) => (
                          <tr key={j.job_id}>
                            <td className="py-2 pr-2 font-medium text-slate-900">{j.job_title}</td>
                            <td className="py-2 pr-2 text-slate-600">{j.tests_count}</td>
                            <td className="py-2 pr-2 text-slate-600">
                              {j.pass_rate_percent == null ? "—" : `${j.pass_rate_percent}%`}
                            </td>
                            <td className="py-2 text-slate-600">{j.avg_score ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Pending tests (next to expire)</div>
              <div className="mt-3 max-h-80 overflow-auto">
                {data.pending_queue.length === 0 ? (
                  <p className="text-sm text-slate-500">No pending tests.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {data.pending_queue.map((row) => (
                      <li key={row.test_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="font-medium text-slate-900">{row.candidate_name}</span>
                        <span className="text-slate-600">{row.job_title}</span>
                        <span className="text-xs text-amber-700">
                          Expires {new Date(row.expires_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AccessGate>
  );
}
