"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, FolderKanban, LayoutDashboard, Plus, UserPlus, Users } from "lucide-react";
import { UI } from "@/lib/ui";

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
    title: "Requisition operations",
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
  const active =
    WORKSPACE_MAP.find((item) => item.match(pathname)) ?? {
      title: "Workspace",
      summary: "Operate recruiting workflows with enterprise-grade context and control.",
      icon: <LayoutDashboard className="h-4 w-4" />,
    };

  return (
    <section className={UI.enterprise.workspaceStrip}>
      <div className="ats-page-inner flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] text-[var(--ats-primary)]">
              {active.icon}
            </span>
            Active workspace
          </div>
          <div className="mt-1 text-lg font-semibold tracking-tight text-[var(--ats-text)]">{active.title}</div>
          <div className="text-sm text-[var(--ats-text-muted)]">{active.summary}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/jobs" className={UI.enterprise.pillInactive}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New job
          </Link>
          <Link href="/candidates" className={UI.enterprise.pillInactive}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            New candidate
          </Link>
          <Link href="/pipeline" className={UI.enterprise.pillInactive}>
            <FolderKanban className="mr-1.5 h-3.5 w-3.5" />
            Open pipeline
          </Link>
        </div>
      </div>
    </section>
  );
}
