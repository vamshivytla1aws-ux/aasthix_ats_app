"use client";

import Link from "next/link";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { UI } from "@/lib/ui";

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
  return (
    <AccessGate permissionKey="dashboard.view">
      <ModulePageFrame
        title="HRMS"
        subtitle="Unified HR operations hub for workforce administration, payroll, compliance, and performance."
      >
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
