"use client";

import { usePathname } from "next/navigation";
import { CalendarClock, FolderKanban, LayoutDashboard, Users } from "lucide-react";
import { UI } from "@/lib/ui";
import { IA_V2_ENABLED, PERSONALIZATION_V2_ENABLED } from "@/lib/featureFlags";
import { useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";

const WORKSPACE_MAP: Array<{
  match: (pathname: string) => boolean;
  title: string;
  summary: string;
  icon: JSX.Element;
}> = [
  {
    match: (pathname) => pathname === "/dashboard",
    title: "Executive overview",
    summary: "KPI pulse, funnel risk, recruiter load, and critical operating signals.",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    match: (pathname) => pathname.startsWith("/pipeline"),
    title: "Pipeline command center",
    summary: "High-density board for movement, ownership, and interview execution.",
    icon: <FolderKanban className="h-4 w-4" />,
  },
  {
    match: (pathname) => pathname.startsWith("/jobs"),
    title: "Job operations",
    summary: "Manage open roles, public distribution, approval state, and delivery readiness.",
    icon: <FolderKanban className="h-4 w-4" />,
  },
  {
    match: (pathname) => pathname.startsWith("/candidates"),
    title: "Talent intelligence",
    summary: "Search, triage, and evaluate candidate readiness across active reqs.",
    icon: <Users className="h-4 w-4" />,
  },
  {
    match: (pathname) => pathname.startsWith("/clients"),
    title: "Account delivery",
    summary: "Track client health, agreement windows, and coverage visibility.",
    icon: <CalendarClock className="h-4 w-4" />,
  },
];

export default function EnterpriseWorkspaceStrip() {
  const pathname = usePathname();
  const [scope, setScope] = useState("all_clients");
  const [dateRange, setDateRange] = useState("this_month");
  const [savedViews, setSavedViews] = useState<Array<{ id: number; name: string }>>([]);
  const [savedViewId, setSavedViewId] = useState<string>("all");
  const pageKey = useMemo(() => {
    if (pathname.startsWith("/pipeline")) return "pipeline";
    if (pathname.startsWith("/jobs")) return "jobs";
    if (pathname.startsWith("/candidates")) return "candidates";
    return null;
  }, [pathname]);

  useEffect(() => {
    if (!PERSONALIZATION_V2_ENABLED) return;
    let cancelled = false;
    apiFetchJson<{ preferences?: { scope?: Record<string, unknown>; filters?: Record<string, unknown> } }>(
      "/api/workspace/preferences"
    )
      .then((data) => {
        if (cancelled) return;
        const nextScope = String(data.preferences?.scope?.active_client ?? "all_clients");
        const nextDate = String(data.preferences?.filters?.date_range ?? "this_month");
        setScope(nextScope);
        setDateRange(nextDate);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!PERSONALIZATION_V2_ENABLED || !pageKey) {
      setSavedViews([]);
      setSavedViewId("all");
      return;
    }
    let cancelled = false;
    apiFetchJson<{ views?: Array<{ id: number; name: string }> }>(`/api/user/saved-views?page=${pageKey}`)
      .then((data) => {
        if (cancelled) return;
        setSavedViews(Array.isArray(data.views) ? data.views : []);
      })
      .catch(() => setSavedViews([]));
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  async function persistContext(next: { scope?: string; dateRange?: string }) {
    if (!PERSONALIZATION_V2_ENABLED) return;
    const nextScope = next.scope ?? scope;
    const nextDate = next.dateRange ?? dateRange;
    setScope(nextScope);
    setDateRange(nextDate);
    try {
      await apiFetchJson("/api/workspace/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: { active_client: nextScope },
          filters: { date_range: nextDate },
        }),
      });
    } catch {
      // non-blocking
    }
  }

  const active =
    WORKSPACE_MAP.find((item) => item.match(pathname)) ?? {
      title: "Workspace",
      summary: "Operate recruiting workflows with enterprise-grade context and control.",
      icon: <LayoutDashboard className="h-4 w-4" />,
    };

  return (
    <section className={UI.enterprise.workspaceStrip}>
      <div className="ats-page-inner flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ats-bg-panel-strong)] text-[var(--ats-primary)]">
              {active.icon}
            </span>
          <div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--ats-text)]">{active.title}</div><div className="hidden truncate text-xs text-[var(--ats-text-muted)] md:block">{active.summary}</div></div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {IA_V2_ENABLED ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1">
              <select
                value={scope}
                onChange={(event) => void persistContext({ scope: event.target.value })}
                className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-2 py-1 text-xs text-[var(--ats-text)]"
              >
                <option value="all_clients">All clients</option>
                <option value="assigned_clients">Assigned clients</option>
                <option value="priority_accounts">Priority accounts</option>
              </select>
              <select
                value={dateRange}
                onChange={(event) => void persistContext({ dateRange: event.target.value })}
                className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-2 py-1 text-xs text-[var(--ats-text)]"
              >
                <option value="today">Today</option>
                <option value="last_7_days">Last 7 days</option>
                <option value="this_month">This month</option>
                <option value="quarter_to_date">Quarter to date</option>
              </select>
              {savedViews.length > 0 ? (
                <select
                  value={savedViewId}
                  onChange={(event) => setSavedViewId(event.target.value)}
                  className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-2 py-1 text-xs text-[var(--ats-text)]"
                >
                  <option value="all">Saved views</option>
                  {savedViews.map((view) => (
                    <option key={view.id} value={String(view.id)}>
                      {view.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
