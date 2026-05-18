"use client";

import Link from "next/link";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { UI } from "@/lib/ui";
import { dashboardFetcher } from "@/lib/swrFetcher";

const MODULES = [
  { href: "/hrms/employees", title: "Employee Directory", subtitle: "Manage employee records, status, and reporting structure." },
  { href: "/hrms/documents", title: "Document Management", subtitle: "Upload and securely manage employee documents." },
  { href: "/hrms/attendance-rules", title: "Attendance Rules", subtitle: "Configure shifts, late/early rules, overtime, and corrections." },
  { href: "/hrms/payroll", title: "Payroll Control", subtitle: "Run monthly payroll, approve runs, and export reports." },
  { href: "/hrms/ctc", title: "CTC Management", subtitle: "Maintain month-wise CTC versions with effective dates and history." },
  { href: "/hrms/onboarding-exit", title: "Onboarding & Exit", subtitle: "Track new joiner and resignation workflows end-to-end." },
  { href: "/hrms/performance", title: "Performance Management", subtitle: "Manage review cycles, ratings, and recommendations." },
  { href: "/salary", title: "Salary Structures", subtitle: "Configure salary and generate payslips." },
  { href: "/attendance", title: "Attendance", subtitle: "Daily attendance registers and employee check-ins." },
  { href: "/timesheet", title: "Timesheet", subtitle: "Task-wise timesheet capture and registers." },
  { href: "/team-calendar", title: "Team Calendar", subtitle: "Internal meeting scheduling and recurring events." },
  { href: "/leave", title: "Leave", subtitle: "Leave applications, approvals, holidays, and balances." },
] as const;

export default function HrmsHomePage() {
  const { data } = useSWR<{ summary: any }>("/api/hrms/summary", dashboardFetcher, { revalidateOnFocus: false });
  const summary = data?.summary;
  const approvals = summary?.pending_approvals;
  const payroll = summary?.payroll;
  const setup = summary?.setup_gaps;
  const compliance = summary?.compliance;
  const diagnostics = summary?.diagnostics;
  const failure = summary?.last_failure;

  return (
    <AccessGate permissionKey="dashboard.view">
      <ModulePageFrame
        title="HRMS"
        subtitle="Unified HR operations hub for workforce administration, payroll, compliance, and performance."
      >
        <div className={UI.card + " p-4 mb-4"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[var(--ats-text)]">Today’s HR Actions</div>
              <div className="text-sm text-[var(--ats-text-muted)]">Start here: resolve blockers first, then run payroll flow (CTC → Payroll → Payslip).</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(summary?.quick_actions || []).map((item: any) => (
                <Link key={item.href} href={item.href} className={UI.secondaryButton + " py-1.5 text-xs"}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 mt-4">
            <div className="rounded-lg border border-[var(--ats-border)] p-3">
              <div className="text-xs text-[var(--ats-text-muted)]">Pending approvals</div>
              <div className="text-lg font-semibold text-[var(--ats-text)]">{approvals?.total ?? 0}</div>
              <div className="text-xs text-[var(--ats-text-muted)]">Leave {approvals?.leave ?? 0} · Corrections {approvals?.attendance_corrections ?? 0}</div>
            </div>
            <div className="rounded-lg border border-[var(--ats-border)] p-3">
              <div className="text-xs text-[var(--ats-text-muted)]">Payroll status</div>
              <div className="text-lg font-semibold capitalize text-[var(--ats-text)]">{payroll?.status || "draft"}</div>
              <div className="text-xs text-[var(--ats-text-muted)]">{payroll ? `${payroll.month}/${payroll.year}` : "Current month"}</div>
            </div>
            <div className="rounded-lg border border-[var(--ats-border)] p-3">
              <div className="text-xs text-[var(--ats-text-muted)]">Employee setup gaps</div>
              <div className="text-lg font-semibold text-[var(--ats-text)]">{(setup?.missing_manager ?? 0) + (setup?.incomplete_profiles ?? 0)}</div>
              <div className="text-xs text-[var(--ats-text-muted)]">Missing manager {setup?.missing_manager ?? 0}</div>
            </div>
            <div className="rounded-lg border border-[var(--ats-border)] p-3">
              <div className="text-xs text-[var(--ats-text-muted)]">Document alerts</div>
              <div className="text-lg font-semibold text-[var(--ats-text)]">{compliance?.expiring_documents_30d ?? 0}</div>
              <div className="text-xs text-[var(--ats-text-muted)]">Expiring in 30 days</div>
            </div>
            <div className="rounded-lg border border-[var(--ats-border)] p-3">
              <div className="text-xs text-[var(--ats-text-muted)]">Schema diagnostics</div>
              <div className={"text-lg font-semibold " + (diagnostics?.status === "warning" ? "text-amber-600" : "text-[var(--ats-text)]")}>
                {diagnostics?.status || "healthy"}
              </div>
              <div className="text-xs text-[var(--ats-text-muted)]">Warn-only, non-blocking</div>
            </div>
          </div>
          {failure ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Latest failed action: {failure.action}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((item) => (
            <Link key={item.href} href={item.href} className={UI.card + " p-4 transition hover:border-[var(--ats-accent)]"}>
              <div className="text-base font-semibold text-[var(--ats-text)]">{item.title}</div>
              <div className="mt-1 text-sm text-[var(--ats-text-muted)]">{item.subtitle}</div>
            </Link>
          ))}
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}
