"use client";

import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import ModuleDataTable, { type ModuleDataTableColumn } from "@/components/enterprise/ModuleDataTable";
import StatusBadge from "@/components/enterprise/StatusBadge";
import AccessGate from "@/components/AccessGate";
import { UI } from "@/lib/ui";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  BarChart3, TrendingUp, Users, Briefcase, Activity, AlertTriangle,
  CheckCircle2, Info, Calendar, Target, RefreshCw, ChevronDown,
} from "lucide-react";
import { DatePicker } from "@/components/ui/DateTimeFields";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OverviewData = {
  summary: {
    total_jobs: number;
    active_jobs: number;
    closed_jobs: number;
    total_candidates: number;
    total_applications: number;
    offers_released: number;
    closures_this_month: number;
    interviews_today: number;
  };
  funnel: Record<string, number>;
  activity: { interviews_today: number; pending_feedback: number; inactive_candidates: number };
  trend: Array<{ date: string; count: number }>;
  insights: Array<{ type: "warning" | "success" | "info"; message: string }>;
};

type RecruiterRow = {
  user_id: number;
  full_name: string;
  email: string;
  assigned_jds: number;
  active_jds: number;
  candidates_submitted: number;
  interviews_scheduled: number;
  closures: number;
  selected: number;
  rejected: number;
  submit_to_interview_pct: number;
  interview_to_selected_pct: number;
  avg_days_to_submit: number | null;
  avg_days_to_close: number | null;
};

type JobRow = {
  id: number;
  title: string;
  company: string;
  status: string;
  total: number;
  applied: number;
  screening: number;
  interview: number;
  selected: number;
  rejected: number;
  days_open: number;
  first_application_at: string | null;
  last_activity_at: string | null;
  dropoffs: { applied_to_screening: number; screening_to_interview: number; interview_to_selected: number };
};

type PipelineData = {
  stage_counts: Record<string, number>;
  avg_time_in_stage: Record<string, number>;
  stage_velocity: Record<string, number>;
  bottlenecks: Array<{ stage: string; reason: string; severity: string }>;
  flow: Array<{ from: string; to: string; conversion_pct: number }>;
};

type SourceRow = {
  source: string;
  total: number;
  screening: number;
  interview: number;
  selected: number;
  rejected: number;
  conversion_pct: number;
  interview_pct: number;
};

type SourceData = {
  sources: SourceRow[];
  candidate_sources: Array<{ source: string; count: number }>;
};

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

const TABS = ["Overview", "Recruiters", "Jobs", "Pipeline", "Sources"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  Overview: <BarChart3 className="h-4 w-4" />,
  Recruiters: <Users className="h-4 w-4" />,
  Jobs: <Briefcase className="h-4 w-4" />,
  Pipeline: <TrendingUp className="h-4 w-4" />,
  Sources: <Target className="h-4 w-4" />,
};

/* ------------------------------------------------------------------ */
/*  Time filters                                                       */
/* ------------------------------------------------------------------ */

type TimeRange = "today" | "week" | "month" | "quarter" | "all" | "custom";

function getTimeParams(range: TimeRange, customFrom?: string, customTo?: string) {
  const now = new Date();
  let from = "";
  let to = "";

  switch (range) {
    case "today":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      break;
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      break;
    }
    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      break;
    case "quarter": {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      from = new Date(now.getFullYear(), qm, 1).toISOString();
      break;
    }
    case "custom":
      from = customFrom || "";
      to = customTo || "";
      break;
  }
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
}

/* ------------------------------------------------------------------ */
/*  Color palette                                                      */
/* ------------------------------------------------------------------ */

const CHART_COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const FUNNEL_COLORS: Record<string, string> = {
  Applied: "#6366f1",
  Screening: "#06b6d4",
  Interview: "#f59e0b",
  Selected: "#10b981",
  Rejected: "#ef4444",
};

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const qs = useMemo(() => getTimeParams(timeRange, customFrom, customTo), [timeRange, customFrom, customTo]);

  return (
    <AccessGate permissionKey="jobs.view">
      <ModulePageFrame
        title="Analytics"
        subtitle="Enterprise hiring analytics and insights"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TimeFilter
              range={timeRange}
              setRange={setTimeRange}
              customFrom={customFrom}
              setCustomFrom={setCustomFrom}
              customTo={customTo}
              setCustomTo={setCustomTo}
            />
            <Link href="/dashboard" className={UI.secondaryButton + " py-2 text-xs"}>
              Dashboard
            </Link>
          </div>
        }
      >
        {/* Tab bar */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition",
                tab === t
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {TAB_ICONS[t]}
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "Overview" && <OverviewTab qs={qs} />}
          {tab === "Recruiters" && <RecruitersTab qs={qs} />}
          {tab === "Jobs" && <JobsTab qs={qs} />}
          {tab === "Pipeline" && <PipelineTab />}
          {tab === "Sources" && <SourcesTab />}
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}

/* ================================================================== */
/*  TIME FILTER                                                        */
/* ================================================================== */

function TimeFilter({
  range, setRange, customFrom, setCustomFrom, customTo, setCustomTo,
}: {
  range: TimeRange;
  setRange: (r: TimeRange) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const labels: Record<TimeRange, string> = {
    today: "Today",
    week: "This Week",
    month: "This Month",
    quarter: "This Quarter",
    all: "All Time",
    custom: "Custom",
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={UI.secondaryButton + " inline-flex items-center gap-1.5 py-2 text-xs"}
      >
        <Calendar className="h-3.5 w-3.5" />
        {labels[range]}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {(Object.keys(labels) as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setRange(r); if (r !== "custom") setOpen(false); }}
              className={[
                "block w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition",
                range === r
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {labels[r]}
            </button>
          ))}
          {range === "custom" && (
            <div className="mt-2 space-y-2 border-t border-slate-100 pt-2 dark:border-slate-700">
              <label className="block text-xs text-slate-500">From</label>
              <DatePicker value={customFrom} onChange={setCustomFrom} className="text-xs" aria-label="Analytics start date" />
              <label className="block text-xs text-slate-500">To</label>
              <DatePicker value={customTo} onChange={setCustomTo} min={customFrom} className="text-xs" aria-label="Analytics end date" />
              <button type="button" onClick={() => setOpen(false)} className={UI.primaryButton + " w-full py-1.5 text-xs"}>
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  OVERVIEW TAB                                                       */
/* ================================================================== */

function OverviewTab({ qs }: { qs: string }) {
  const { data, isLoading, mutate } = useSWR<OverviewData>(
    `/api/analytics/overview${qs ? `?${qs}` : ""}`,
    dashboardFetcher,
    { refreshInterval: 60_000 }
  );

  if (isLoading) return <SkeletonCards count={5} />;
  if (!data) return <ErrorBanner message="Failed to load overview" onRetry={() => void mutate()} />;

  const { summary: s, funnel, activity, trend, insights } = data;

  const funnelData = [
    { stage: "Applied", count: funnel.applied ?? 0 },
    { stage: "Screening", count: funnel.screening ?? 0 },
    { stage: "Interview", count: funnel.interview ?? 0 },
    { stage: "Selected", count: funnel.selected ?? 0 },
  ];

  const funnelTotal = funnelData.reduce((a, b) => a + b.count, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Total Candidates" value={s.total_candidates} icon={<Users className="h-5 w-5" />} color="indigo" />
        <SummaryCard label="Active Jobs" value={s.active_jobs} icon={<Briefcase className="h-5 w-5" />} color="emerald" />
        <SummaryCard label="Interviews Today" value={s.interviews_today} icon={<Calendar className="h-5 w-5" />} color="amber" />
        <SummaryCard label="Offers Released" value={s.offers_released} icon={<CheckCircle2 className="h-5 w-5" />} color="teal" />
        <SummaryCard label="Closures (Month)" value={s.closures_this_month} icon={<Target className="h-5 w-5" />} color="violet" />
      </div>

      {/* Funnel + Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Funnel chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Hiring Funnel</h3>
          {funnelTotal === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No application data to display</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnelData} barSize={56}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #e2e8f0" }}
                    formatter={((value: unknown) => {
                      const v = Number(value);
                      const pct = funnelTotal > 0 ? ((v / funnelTotal) * 100).toFixed(1) : "0";
                      return `${v} (${pct}%)`;
                    }) as never}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {funnelData.map((d) => (
                      <Cell key={d.stage} fill={FUNNEL_COLORS[d.stage] ?? "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Conversion labels */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                {funnelData.slice(0, -1).map((d, i) => {
                  const next = funnelData[i + 1];
                  const pct = d.count > 0 ? Math.round((next.count / d.count) * 100) : 0;
                  return (
                    <span key={d.stage} className="inline-flex items-center gap-1">
                      {d.stage} → {next.stage}:
                      <span className={pct > 40 ? "font-bold text-emerald-600" : "font-bold text-amber-600"}>
                        {pct}%
                      </span>
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Activity summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Activity Summary</h3>
          <div className="space-y-4">
            <ActivityRow label="Interviews today" value={activity.interviews_today} icon={<Calendar className="h-4 w-4 text-indigo-500" />} />
            <ActivityRow label="Pending feedback" value={activity.pending_feedback} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} warn={activity.pending_feedback > 5} />
            <ActivityRow label="Inactive >3 days" value={activity.inactive_candidates} icon={<Activity className="h-4 w-4 text-red-500" />} warn={activity.inactive_candidates > 10} />
          </div>
          <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Quick stats</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{s.total_jobs}</div>
                <div className="text-xs text-slate-500">Total Jobs</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{s.total_applications}</div>
                <div className="text-xs text-slate-500">Applications</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trend chart */}
      {trend.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Application Trend (30 days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => {
                  const dt = new Date(d);
                  return `${dt.getMonth() + 1}/${dt.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Applications" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Smart Insights */}
      {insights.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Smart Insights</h3>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <InsightRow key={i} type={ins.type} message={ins.message} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  RECRUITERS TAB                                                     */
/* ================================================================== */

function RecruitersTab({ qs }: { qs: string }) {
  const { data, isLoading, mutate } = useSWR<{ recruiters: RecruiterRow[] }>(
    `/api/analytics/recruiters${qs ? `?${qs}` : ""}`,
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );

  if (isLoading) return <SkeletonCards count={3} />;
  if (!data) return <ErrorBanner message="Failed to load recruiter analytics" onRetry={() => void mutate()} />;

  const { recruiters } = data;

  const leaderboard = [...recruiters].sort((a, b) => b.selected - a.selected).slice(0, 10);

  const columns: ModuleDataTableColumn<RecruiterRow>[] = [
    { id: "name", header: "Recruiter", csvValue: (r) => r.full_name, cell: (r) => <span className="font-medium">{r.full_name}</span>, sortValue: (r) => r.full_name },
    { id: "assigned", header: "Assigned JDs", csvValue: (r) => String(r.assigned_jds), cell: (r) => r.assigned_jds, sortValue: (r) => r.assigned_jds, align: "right" },
    { id: "active", header: "Active JDs", csvValue: (r) => String(r.active_jds), cell: (r) => r.active_jds, sortValue: (r) => r.active_jds, align: "right" },
    { id: "submitted", header: "Submitted", csvValue: (r) => String(r.candidates_submitted), cell: (r) => r.candidates_submitted, sortValue: (r) => r.candidates_submitted, align: "right" },
    { id: "interviews", header: "Interviews", csvValue: (r) => String(r.interviews_scheduled), cell: (r) => r.interviews_scheduled, sortValue: (r) => r.interviews_scheduled, align: "right" },
    { id: "closures", header: "Closures", csvValue: (r) => String(r.closures), cell: (r) => <span className="font-semibold text-emerald-600">{r.closures}</span>, sortValue: (r) => r.closures, align: "right" },
    {
      id: "s2i", header: "Submit→Interview %", csvValue: (r) => `${r.submit_to_interview_pct}%`,
      cell: (r) => <ConversionBadge value={r.submit_to_interview_pct} />,
      sortValue: (r) => r.submit_to_interview_pct, align: "right",
    },
    {
      id: "i2s", header: "Interview→Selected %", csvValue: (r) => `${r.interview_to_selected_pct}%`,
      cell: (r) => <ConversionBadge value={r.interview_to_selected_pct} />,
      sortValue: (r) => r.interview_to_selected_pct, align: "right",
    },
    {
      id: "avgSubmit", header: "Avg Days to Submit", csvValue: (r) => r.avg_days_to_submit?.toFixed(1) ?? "—",
      cell: (r) => r.avg_days_to_submit != null ? `${r.avg_days_to_submit.toFixed(1)}d` : "—",
      sortValue: (r) => r.avg_days_to_submit ?? 999, align: "right",
    },
    {
      id: "avgClose", header: "Avg Days to Close", csvValue: (r) => r.avg_days_to_close?.toFixed(1) ?? "—",
      cell: (r) => r.avg_days_to_close != null ? `${r.avg_days_to_close.toFixed(1)}d` : "—",
      sortValue: (r) => r.avg_days_to_close ?? 999, align: "right",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Leaderboard chart */}
      {leaderboard.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Recruiter Leaderboard — Closures</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, leaderboard.length * 40)}>
            <BarChart data={leaderboard} layout="vertical" barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="full_name"
                tick={{ fontSize: 11 }}
                width={140}
                tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
              />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="selected" fill="#10b981" name="Selected" radius={[0, 6, 6, 0]} />
              <Bar dataKey="interviews_scheduled" fill="#6366f1" name="Interviews" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <ModuleDataTable
        rows={recruiters}
        rowKey={(r) => r.user_id}
        columns={columns}
        storageKey="analytics-recruiters-cols"
        exportBasename="recruiter-analytics"
        emptyMessage="No recruiter data available"
      />
    </div>
  );
}

/* ================================================================== */
/*  JOBS TAB                                                           */
/* ================================================================== */

function JobsTab({ qs }: { qs: string }) {
  const { data, isLoading, mutate } = useSWR<{ jobs: JobRow[] }>(
    `/api/analytics/jobs${qs ? `?${qs}` : ""}`,
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );
  const [selectedJob, setSelectedJob] = useState<number | null>(null);

  if (isLoading) return <SkeletonCards count={3} />;
  if (!data) return <ErrorBanner message="Failed to load job analytics" onRetry={() => void mutate()} />;

  const { jobs } = data;
  const selected = selectedJob != null ? jobs.find((j) => j.id === selectedJob) : null;

  const columns: ModuleDataTableColumn<JobRow>[] = [
    {
      id: "title", header: "Job Title", csvValue: (r) => r.title,
      cell: (r) => (
        <button type="button" onClick={() => setSelectedJob(r.id)} className="text-left font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          {r.title}
        </button>
      ),
      sortValue: (r) => r.title,
    },
    { id: "company", header: "Company", csvValue: (r) => r.company ?? "", cell: (r) => r.company ?? "—", sortValue: (r) => r.company ?? "" },
    { id: "status", header: "Status", csvValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status || "Open"} />, sortValue: (r) => r.status },
    { id: "total", header: "Total Apps", csvValue: (r) => String(r.total), cell: (r) => r.total, sortValue: (r) => r.total, align: "right" },
    { id: "applied", header: "Applied", csvValue: (r) => String(r.applied), cell: (r) => r.applied, sortValue: (r) => r.applied, align: "right" },
    { id: "screening", header: "Screening", csvValue: (r) => String(r.screening), cell: (r) => r.screening, sortValue: (r) => r.screening, align: "right" },
    { id: "interview", header: "Interview", csvValue: (r) => String(r.interview), cell: (r) => r.interview, sortValue: (r) => r.interview, align: "right" },
    { id: "selected", header: "Selected", csvValue: (r) => String(r.selected), cell: (r) => <span className="font-semibold text-emerald-600">{r.selected}</span>, sortValue: (r) => r.selected, align: "right" },
    { id: "days", header: "Days Open", csvValue: (r) => String(r.days_open ?? 0), cell: (r) => <DaysOpenBadge days={r.days_open} />, sortValue: (r) => r.days_open ?? 0, align: "right" },
    {
      id: "dropoff", header: "Drop-off %", csvValue: (r) => `${r.dropoffs.applied_to_screening}/${r.dropoffs.screening_to_interview}/${r.dropoffs.interview_to_selected}`,
      cell: (r) => (
        <div className="text-xs tabular-nums">
          <span className="text-slate-500">A→S</span> {r.dropoffs.applied_to_screening}%{" "}
          <span className="text-slate-500">S→I</span> {r.dropoffs.screening_to_interview}%{" "}
          <span className="text-slate-500">I→Sel</span> {r.dropoffs.interview_to_selected}%
        </div>
      ),
      defaultVisible: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Selected job detail */}
      {selected && <JobDetailPanel job={selected} onClose={() => setSelectedJob(null)} />}

      <ModuleDataTable
        rows={jobs}
        rowKey={(r) => r.id}
        columns={columns}
        storageKey="analytics-jobs-cols"
        exportBasename="job-analytics"
        emptyMessage="No jobs found"
      />
    </div>
  );
}

function JobDetailPanel({ job, onClose }: { job: JobRow; onClose: () => void }) {
  const stages = [
    { label: "Applied", count: job.applied, color: "#6366f1" },
    { label: "Screening", count: job.screening, color: "#06b6d4" },
    { label: "Interview", count: job.interview, color: "#f59e0b" },
    { label: "Selected", count: job.selected, color: "#10b981" },
    { label: "Rejected", count: job.rejected, color: "#ef4444" },
  ];

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-5 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/20">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{job.title}</h3>
          <p className="text-xs text-slate-500">{job.company} — <StatusBadge status={job.status || "Open"} /></p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">Close</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stages.map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label="Days Open" value={`${job.days_open ?? 0}d`} />
        <MiniStat label="Applied → Screening drop" value={`${job.dropoffs.applied_to_screening}%`} warn={job.dropoffs.applied_to_screening > 70} />
        <MiniStat label="Screening → Interview drop" value={`${job.dropoffs.screening_to_interview}%`} warn={job.dropoffs.screening_to_interview > 60} />
        <MiniStat label="Interview → Selected drop" value={`${job.dropoffs.interview_to_selected}%`} warn={job.dropoffs.interview_to_selected > 80} />
      </div>

      {/* Mini funnel chart */}
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stages.filter((s) => s.label !== "Rejected")} barSize={48}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {stages.filter((s) => s.label !== "Rejected").map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  PIPELINE TAB                                                       */
/* ================================================================== */

function PipelineTab() {
  const { data, isLoading, mutate } = useSWR<PipelineData>(
    `/api/analytics/pipeline`,
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );

  if (isLoading) return <SkeletonCards count={3} />;
  if (!data) return <ErrorBanner message="Failed to load pipeline analytics" onRetry={() => void mutate()} />;

  const stages = ["Applied", "Screening", "Interview", "Selected", "Rejected"];
  const stageData = stages.map((s) => ({
    stage: s,
    count: data.stage_counts[s] ?? 0,
    avg_days: data.avg_time_in_stage[s] ?? 0,
    velocity: data.stage_velocity[s] ?? 0,
  }));

  const flowData = data.flow;

  return (
    <div className="space-y-6">
      {/* Stage counts chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Candidates per Stage</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stageData} barSize={48}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="count" name="Candidates" radius={[6, 6, 0, 0]}>
                {stageData.map((d) => (
                  <Cell key={d.stage} fill={FUNNEL_COLORS[d.stage] ?? "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Avg time in stage */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Avg Time in Stage (days)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stageData.filter((d) => d.stage !== "Selected" && d.stage !== "Rejected")} barSize={48}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={((v: unknown) => `${Number(v).toFixed(1)} days`) as never} />
              <Bar dataKey="avg_days" name="Avg Days" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stage flow conversion */}
      {flowData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Stage Conversion Flow</h3>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {flowData.map((f) => (
              <div key={`${f.from}-${f.to}`} className="flex items-center gap-2">
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold dark:bg-slate-800">{f.from}</div>
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-bold ${f.conversion_pct > 40 ? "text-emerald-600" : "text-amber-600"}`}>
                    {f.conversion_pct}%
                  </span>
                  <svg className="h-3 w-6 text-slate-400" viewBox="0 0 24 12"><path d="M0 6h20m-4-4 4 4-4 4" stroke="currentColor" fill="none" strokeWidth="2" /></svg>
                </div>
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold dark:bg-slate-800">{f.to}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottlenecks */}
      {data.bottlenecks.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/20">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Bottlenecks Detected
          </h3>
          <div className="space-y-2">
            {data.bottlenecks.map((b, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <StatusBadge status={b.stage} />
                <span className="text-slate-700 dark:text-slate-300">{b.reason}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                  b.severity === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {b.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  SOURCES TAB                                                        */
/* ================================================================== */

function SourcesTab() {
  const { data, isLoading, mutate } = useSWR<SourceData>(
    `/api/analytics/sources`,
    dashboardFetcher,
    { refreshInterval: 120_000 }
  );

  if (isLoading) return <SkeletonCards count={3} />;
  if (!data) return <ErrorBanner message="Failed to load source analytics" onRetry={() => void mutate()} />;

  const { sources, candidate_sources } = data;

  const pieData = sources.map((s, i) => ({
    name: s.source,
    value: s.total,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const columns: ModuleDataTableColumn<SourceRow>[] = [
    { id: "source", header: "Source", csvValue: (r) => r.source, cell: (r) => <span className="font-medium">{r.source}</span>, sortValue: (r) => r.source },
    { id: "total", header: "Applications", csvValue: (r) => String(r.total), cell: (r) => r.total, sortValue: (r) => r.total, align: "right" },
    { id: "screening", header: "Screening", csvValue: (r) => String(r.screening), cell: (r) => r.screening, sortValue: (r) => r.screening, align: "right" },
    { id: "interview", header: "Interview", csvValue: (r) => String(r.interview), cell: (r) => r.interview, sortValue: (r) => r.interview, align: "right" },
    { id: "selected", header: "Selected", csvValue: (r) => String(r.selected), cell: (r) => <span className="font-semibold text-emerald-600">{r.selected}</span>, sortValue: (r) => r.selected, align: "right" },
    { id: "conversion", header: "Conversion %", csvValue: (r) => `${r.conversion_pct}%`, cell: (r) => <ConversionBadge value={r.conversion_pct} />, sortValue: (r) => r.conversion_pct, align: "right" },
    { id: "interview_pct", header: "Interview %", csvValue: (r) => `${r.interview_pct}%`, cell: (r) => <ConversionBadge value={r.interview_pct} />, sortValue: (r) => r.interview_pct, align: "right" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Applications by Source</h3>
          {pieData.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No source data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={((props: { name?: string; percent?: number }) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`) as never}>
                  {pieData.map((d, i) => (
                    <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Conversion by source bar chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Conversion by Source</h3>
          {sources.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sources} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={((v: unknown) => `${v}%`) as never} />
                <Bar dataKey="conversion_pct" name="Conversion %" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="interview_pct" name="Interview %" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <ModuleDataTable
        rows={sources}
        rowKey={(r) => r.source}
        columns={columns}
        storageKey="analytics-sources-cols"
        exportBasename="source-analytics"
        emptyMessage="No source data available"
      />

      {/* Candidate sources */}
      {candidate_sources.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Candidate Sources</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {candidate_sources.map((cs) => (
              <div key={cs.source} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{cs.count}</div>
                <div className="text-xs text-slate-500">{cs.source}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  SHARED COMPONENTS                                                  */
/* ================================================================== */

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const bg: Record<string, string> = {
    indigo: "from-indigo-50 to-white border-t-indigo-500",
    emerald: "from-emerald-50 to-white border-t-emerald-500",
    amber: "from-amber-50 to-white border-t-amber-500",
    teal: "from-teal-50 to-white border-t-teal-500",
    violet: "from-violet-50 to-white border-t-violet-500",
  };
  const iconBg: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    teal: "bg-teal-100 text-teal-700",
    violet: "bg-violet-100 text-violet-700",
  };

  return (
    <div className={`rounded-2xl border border-slate-200 border-t-4 bg-gradient-to-br p-5 shadow-sm transition hover:shadow-md ${bg[color] ?? bg.indigo}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value.toLocaleString()}</div>
        </div>
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${iconBg[color] ?? iconBg.indigo}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ label, value, icon, warn }: { label: string; value: number; icon: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="flex-1 text-sm text-slate-700 dark:text-slate-300">{label}</div>
      <div className={`text-lg font-bold ${warn ? "text-red-600" : "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

function InsightRow({ type, message }: { type: "warning" | "success" | "info"; message: string }) {
  const icons = {
    warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />,
    success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />,
    info: <Info className="h-4 w-4 shrink-0 text-blue-500" />,
  };
  const bg = {
    warning: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
    success: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
    info: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
  };

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${bg[type]}`}>
      {icons[type]}
      <span className="text-sm text-slate-700 dark:text-slate-300">{message}</span>
    </div>
  );
}

function ConversionBadge({ value }: { value: number }) {
  const color = value >= 50 ? "text-emerald-700 bg-emerald-50" : value >= 25 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{value}%</span>;
}

function DaysOpenBadge({ days }: { days: number }) {
  const color = days > 30 ? "text-red-700 bg-red-50" : days > 14 ? "text-amber-700 bg-amber-50" : "text-slate-700 bg-slate-50";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{days}d</span>;
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
      <div className={`text-lg font-bold ${warn ? "text-red-600" : "text-slate-900 dark:text-slate-100"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-8 w-14 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      {message}
      <button type="button" onClick={onRetry} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200">
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}
