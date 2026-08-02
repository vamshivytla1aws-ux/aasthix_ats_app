"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";
import { APP_CONFIG } from "@/lib/config";
import { UI } from "@/lib/ui";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";
import AccessGate from "@/components/AccessGate";
import DashboardAttendanceCard from "@/components/attendance/DashboardAttendanceCard";
import HrAssistantPanel from "@/components/hrAssistant/HrAssistantPanel";
import { DASHBOARD_V2_ENABLED, INTELLIGENCE_V3_ENABLED, PERSONALIZATION_V2_ENABLED } from "@/lib/featureFlags";

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

function MetricCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={UI.enterprise.metricCard}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">{title}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ats-text)]">{value}</div>
          <div className="mt-1 text-sm text-[var(--ats-text-muted)]">{detail}</div>
        </div>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] text-[var(--ats-primary)]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [alerts, setAlerts] = useState<InterviewAlert[]>([]);
  const [sla, setSla] = useState<{
    stale_in_stage_over_days: number;
    stale_days_threshold: number;
    interview_overdue_after_hours: number;
    interview_stale_hours_threshold: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("user");
  const [widgetOrder, setWidgetOrder] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState<"admin" | "recruiter" | "employee" | "custom">("custom");
  const [intelligenceSummary, setIntelligenceSummary] = useState<any>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [jobsResult, candidatesResult, applicationsResult, slaResult] = await Promise.allSettled([
        apiFetchJson<Job[]>("/api/jobs"),
        apiFetchJson<Candidate[]>("/api/candidates"),
        apiFetchJson<Application[]>("/api/applications"),
        apiFetchJson<{
          stale_in_stage_over_days: number;
          stale_days_threshold: number;
          interview_overdue_after_hours: number;
          interview_stale_hours_threshold: number;
        }>("/api/dashboard/sla"),
      ]);
      if (jobsResult.status === "fulfilled") setJobs(jobsResult.value);
      if (candidatesResult.status === "fulfilled") setCandidates(candidatesResult.value);
      if (applicationsResult.status === "fulfilled") setApplications(applicationsResult.value);
      if (slaResult.status === "fulfilled") setSla(slaResult.value);
      const failedCoreRequests = [jobsResult, candidatesResult, applicationsResult].filter((result) => result.status === "rejected");
      if (failedCoreRequests.length === 3) setError("Dashboard data is temporarily unavailable. Refresh to try again.");
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
    void load();
    void loadAlerts();
    apiFetchJson<{ user?: { role?: string } }>("/api/auth/me")
      .then((data) => setRole(String(data.user?.role || "user").toLowerCase()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void loadAlerts(), 60_000);
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
  const conversionRate = applications.length ? Math.round((perStage.Selected / applications.length) * 100) : 0;
  const interviewLoad = perStage.Interview;
  const alertSummary = useMemo(() => {
    const ongoing = alerts.filter((a) => a.type === "ongoing").length;
    const upcoming = alerts.filter((a) => a.type === "upcoming").length;
    return { ongoing, upcoming };
  }, [alerts]);
  const riskCount = (sla?.stale_in_stage_over_days || 0) + (sla?.interview_overdue_after_hours || 0);

  useEffect(() => {
    if (!DASHBOARD_V2_ENABLED || !PERSONALIZATION_V2_ENABLED) return;
    apiFetchJson<{ layout?: { dashboard?: { widgets?: string[] } } }>("/api/workspace/layout")
      .then((data) => {
        const widgets = data.layout?.dashboard?.widgets;
        if (Array.isArray(widgets) && widgets.length > 0) setWidgetOrder(widgets);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!INTELLIGENCE_V3_ENABLED) return;
    apiFetchJson("/api/intelligence/summary")
      .then((data) => setIntelligenceSummary(data))
      .catch(() => {});
  }, []);

  const presetLayouts = useMemo(
    () => ({
      admin: ["kpi", "risk", "pipeline", "actions", "assistant", "attendance"],
      recruiter: ["kpi", "pipeline", "actions", "risk", "assistant", "attendance"],
      employee: ["attendance", "actions", "assistant", "kpi"],
    }),
    []
  );
  const rolePresetWidgets = useMemo(() => {
    if (role === "admin") return presetLayouts.admin;
    if (role === "recruiter") return presetLayouts.recruiter;
    if (role === "employee") return presetLayouts.employee;
    return presetLayouts.recruiter;
  }, [presetLayouts, role]);

  const activeWidgets = widgetOrder.length > 0 ? widgetOrder : rolePresetWidgets;

  async function persistWidgetOrder(nextOrder: string[]) {
    setWidgetOrder(nextOrder);
    if (!PERSONALIZATION_V2_ENABLED) return;
    try {
      await apiFetchJson("/api/workspace/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboard: { widgets: nextOrder, hidden_widgets: [] }, modules: {} }),
      });
    } catch {
      // non-blocking
    }
  }

  function arraysEqual(a: string[], b: string[]) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }

  const syncActivePreset = useCallback((order: string[]) => {
    if (arraysEqual(order, presetLayouts.admin)) {
      setActivePreset("admin");
      return;
    }
    if (arraysEqual(order, presetLayouts.recruiter)) {
      setActivePreset("recruiter");
      return;
    }
    if (arraysEqual(order, presetLayouts.employee)) {
      setActivePreset("employee");
      return;
    }
    setActivePreset("custom");
  }, [presetLayouts.admin, presetLayouts.employee, presetLayouts.recruiter]);

  async function applyPreset(preset: "admin" | "recruiter" | "employee") {
    setActivePreset(preset);
    await persistWidgetOrder(presetLayouts[preset]);
  }

  useEffect(() => {
    syncActivePreset(activeWidgets);
  }, [role, widgetOrder, activeWidgets, syncActivePreset]);

  const sections: Record<string, React.ReactNode> = {
    kpi: (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Open jobs" value={openJobs} detail={`${closedJobs} closed roles in the system`} icon={<BriefcaseBusiness className="h-6 w-6" />} />
        <MetricCard title="Candidate pool" value={candidates.length} detail={`${applications.length} active application records`} icon={<UsersRound className="h-6 w-6" />} />
        <MetricCard title="Interview load" value={interviewLoad} detail={`${alertSummary.upcoming} upcoming and ${alertSummary.ongoing} live signals`} icon={<Clock3 className="h-6 w-6" />} />
        <MetricCard title="Operational risk" value={riskCount} detail="Stale pipeline items and overdue interview actions" icon={<ShieldAlert className="h-6 w-6" />} />
      </div>
    ),
    pipeline: (
      <section className={`${UI.enterprise.elevatedCard} p-6`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">Pipeline health</div>
            <div className="mt-1 text-lg font-semibold text-[var(--ats-text)]">Stage distribution and conversion</div>
          </div>
          <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-4 py-3 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">Conversion</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--ats-text)]">{conversionRate}%</div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {STAGES.map((s) => (
            <div key={s} className="rounded-2xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-panel)] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">{s}</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ats-text)]">{perStage[s]}</div>
            </div>
          ))}
        </div>
      </section>
    ),
    risk: (
      <section className={`${UI.enterprise.elevatedCard} p-6`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">Risk and exceptions</div>
        <div className="mt-3 space-y-3">
          {sla ? (
            <>
              <div className="rounded-2xl border border-[color:rgb(245_158_11_/_0.22)] bg-[color:rgb(245_158_11_/_0.11)] p-4">
                <div className="text-sm font-semibold text-[var(--ats-text)]">Pipeline aging</div>
                <div className="mt-1 text-sm text-[var(--ats-text-muted)]">{sla.stale_in_stage_over_days} applications have had no stage change for {sla.stale_days_threshold}+ days.</div>
              </div>
              <div className="rounded-2xl border border-[color:rgb(239_68_68_/_0.2)] bg-[color:rgb(239_68_68_/_0.1)] p-4">
                <div className="text-sm font-semibold text-[var(--ats-text)]">Interview latency</div>
                <div className="mt-1 text-sm text-[var(--ats-text-muted)]">{sla.interview_overdue_after_hours} scheduled interviews are older than {sla.interview_stale_hours_threshold} hours.</div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4 text-sm text-[var(--ats-text-muted)]">SLA telemetry is not available right now.</div>
          )}
        </div>
      </section>
    ),
    actions: (
      <section className={`${UI.enterprise.elevatedCard} p-6`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">Action queue</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[{ href: "/jobs", title: "Create job", body: "Open a role and start delivery planning." }, { href: "/candidates", title: "Add candidate", body: "Add/import talent into pool." }, { href: "/pipeline", title: "Manage pipeline", body: "Move stages and rebalance ownership." }, { href: "/interviews", title: "Interview desk", body: "Schedule and close interview actions." }].map((item) => (
            <Link key={item.href} href={item.href} className="group rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4 shadow-[var(--ats-shadow-sm)] transition hover:border-[var(--ats-border-strong)] hover:bg-[var(--ats-bg-panel-strong)]">
              <div className="text-base font-semibold text-[var(--ats-text)]">{item.title}</div>
              <div className="mt-2 text-sm leading-6 text-[var(--ats-text-muted)]">{item.body}</div>
            </Link>
          ))}
        </div>
      </section>
    ),
    assistant: <HrAssistantPanel />,
    attendance: <DashboardAttendanceCard />,
    risk_heatmap: INTELLIGENCE_V3_ENABLED ? (
      <section className={`${UI.enterprise.elevatedCard} p-6`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">Risk heatmap</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4">
            <div className="text-sm text-[var(--ats-text-muted)]">High-risk applications</div>
            <div className="mt-1 text-3xl font-semibold text-[var(--ats-text)]">
              {intelligenceSummary?.summary?.totals?.high_risk_applications ?? 0}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4">
            <div className="text-sm text-[var(--ats-text-muted)]">High-risk jobs</div>
            <div className="mt-1 text-3xl font-semibold text-[var(--ats-text)]">
              {intelligenceSummary?.summary?.totals?.high_risk_jobs ?? 0}
            </div>
          </div>
        </div>
      </section>
    ) : null,
  };

  return (
    <AccessGate permissionKey="dashboard.view">
      <div className="space-y-5">
        <section className={UI.enterprise.commandRail}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:rgb(37_99_235_/_0.18)] bg-[color:rgb(255_255_255_/_0.55)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-primary)]">
                <Sparkles className="h-3.5 w-3.5" />
                Executive command center
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ats-text)]">Recruiting operations at a glance</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--ats-text-muted)]">
                {APP_CONFIG.appName} now surfaces funnel performance, recruiter load, and delivery risk in one premium workspace.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-1">
                <button
                  type="button"
                  onClick={() => void applyPreset("admin")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${activePreset === "admin" ? "bg-[var(--ats-primary)] text-white" : "text-[var(--ats-text-muted)]"}`}
                >
                  Admin preset
                </button>
                <button
                  type="button"
                  onClick={() => void applyPreset("recruiter")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${activePreset === "recruiter" ? "bg-[var(--ats-primary)] text-white" : "text-[var(--ats-text-muted)]"}`}
                >
                  Recruiter preset
                </button>
                <button
                  type="button"
                  onClick={() => void applyPreset("employee")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${activePreset === "employee" ? "bg-[var(--ats-primary)] text-white" : "text-[var(--ats-text-muted)]"}`}
                >
                  Employee preset
                </button>
              </div>
              <button onClick={() => void load()} className={UI.primaryButton + " py-2 text-sm"}>
                Refresh workspace
              </button>
            </div>
          </div>
        </section>

        {error ? <div className="text-sm text-[var(--ats-danger)]">{error}</div> : null}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${UI.enterprise.metricCard} h-36 animate-pulse bg-[var(--ats-bg-panel)]`} />
            ))}
          </div>
        ) : DASHBOARD_V2_ENABLED ? (
          <div className="space-y-4">
            {activeWidgets.map((widgetId) =>
              sections[widgetId] ? (
                <section key={widgetId} className="space-y-2">
                  {sections[widgetId]}
                </section>
              ) : null
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Open jobs"
                value={openJobs}
                detail={`${closedJobs} closed roles in the system`}
                icon={<BriefcaseBusiness className="h-6 w-6" />}
              />
              <MetricCard
                title="Candidate pool"
                value={candidates.length}
                detail={`${applications.length} active application records`}
                icon={<UsersRound className="h-6 w-6" />}
              />
              <MetricCard
                title="Interview load"
                value={interviewLoad}
                detail={`${alertSummary.upcoming} upcoming and ${alertSummary.ongoing} live signals`}
                icon={<Clock3 className="h-6 w-6" />}
              />
              <MetricCard
                title="Operational risk"
                value={riskCount}
                detail="Stale pipeline items and overdue interview actions"
                icon={<ShieldAlert className="h-6 w-6" />}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
              <section className={`${UI.enterprise.elevatedCard} p-6`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">
                      Funnel pulse
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[var(--ats-text)]">
                      Stage distribution and conversion
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-4 py-3 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">
                      Conversion
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-[var(--ats-text)]">{conversionRate}%</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {STAGES.map((s) => (
                    <div key={s} className="rounded-2xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-panel)] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">{s}</div>
                      <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ats-text)]">{perStage[s]}</div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--ats-border-subtle)]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--ats-primary),var(--ats-accent))]"
                          style={{
                            width: `${applications.length ? Math.max(8, Math.round((perStage[s] / applications.length) * 100)) : 8}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`${UI.enterprise.elevatedCard} p-6`}>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">
                  <Activity className="h-4 w-4 text-[var(--ats-primary)]" />
                  Exception queue
                </div>
                <div className="mt-3 space-y-3">
                  {sla ? (
                    <>
                      <div className="rounded-2xl border border-[color:rgb(245_158_11_/_0.22)] bg-[color:rgb(245_158_11_/_0.11)] p-4">
                        <div className="text-sm font-semibold text-[var(--ats-text)]">Pipeline aging</div>
                        <div className="mt-1 text-sm text-[var(--ats-text-muted)]">
                          {sla.stale_in_stage_over_days} applications have had no stage change for {sla.stale_days_threshold}+ days.
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[color:rgb(239_68_68_/_0.2)] bg-[color:rgb(239_68_68_/_0.1)] p-4">
                        <div className="text-sm font-semibold text-[var(--ats-text)]">Interview latency</div>
                        <div className="mt-1 text-sm text-[var(--ats-text-muted)]">
                          {sla.interview_overdue_after_hours} scheduled interviews are older than {sla.interview_stale_hours_threshold} hours.
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4 text-sm text-[var(--ats-text-muted)]">
                      SLA telemetry is not available right now.
                    </div>
                  )}

                  <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4">
                    <div className="text-sm font-semibold text-[var(--ats-text)]">Interview alerts</div>
                    <div className="mt-2 space-y-2">
                      {alerts.length === 0 ? (
                        <div className="text-sm text-[var(--ats-text-muted)]">No interview alerts at the moment.</div>
                      ) : (
                        alerts.slice(0, 4).map((alert) => (
                          <div key={alert.id} className="rounded-xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-elevated)] px-3 py-2">
                            <div className="text-sm font-semibold text-[var(--ats-text)]">{alert.candidate_full_name}</div>
                            <div className="text-xs text-[var(--ats-text-muted)]">{alert.message}</div>
                            <div className="mt-1 text-[11px] text-[var(--ats-text-soft)]">{formatDateTime(alert.interview_datetime)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <DashboardAttendanceCard />

            <HrAssistantPanel />

            <section className={`${UI.enterprise.elevatedCard} p-6`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">
                    Quick action rail
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[var(--ats-text)]">Jump into the highest-value workflows</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    href: "/jobs",
                    title: "Create job",
                    body: "Open a job and start team delivery planning.",
                  },
                  {
                    href: "/candidates",
                    title: "Add candidate",
                    body: "Create or import a candidate into the active talent pool.",
                  },
                  {
                    href: "/pipeline",
                    title: "Manage pipeline",
                    body: "Move stages, rebalance ownership, and resolve bottlenecks.",
                  },
                  {
                    href: "/interviews",
                    title: "Interview desk",
                    body: "Coordinate upcoming interviews and close stale decisions.",
                  },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4 shadow-[var(--ats-shadow-sm)] transition hover:border-[var(--ats-border-strong)] hover:bg-[var(--ats-bg-panel-strong)]"
                  >
                    <div className="text-base font-semibold text-[var(--ats-text)]">{item.title}</div>
                    <div className="mt-2 text-sm leading-6 text-[var(--ats-text-muted)]">{item.body}</div>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--ats-primary)]">
                      Open
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AccessGate>
  );
}
