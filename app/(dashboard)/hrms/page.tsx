"use client";

import Link from "next/link";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import HrmsSelfServiceHome from "@/components/hrms/HrmsSelfServiceHome";
import { UI } from "@/lib/ui";
import { dashboardFetcher } from "@/lib/swrFetcher";

const MAIN = [
  { href: "/hrms/employees", title: "Employees & Payslips", text: "Add an employee, save salary details, set up login and generate payslips.", permission: "employee_directory.view_all" },
  { href: "/leave", title: "Leave", text: "Review leave requests and manage balances.", permission: "leave.view_self" },
  { href: "/attendance", title: "Attendance", text: "View attendance and check-ins.", permission: "attendance.view_all" },
  { href: "/hrms/documents", title: "Documents", text: "Manage offer letters, employee records and certificates.", permission: "documents.view_all" },
];
const MORE = [
  { href: "/hrms/payroll", title: "Payroll approvals", permission: "payroll.run" },
  { href: "/hrms/ctc", title: "Salary history", permission: "salary.manage" },
  { href: "/hrms/attendance-rules", title: "Attendance settings", permission: "attendance_rules.manage" },
  { href: "/hrms/onboarding-exit", title: "Onboarding & exit", permission: "onboarding_exit.view_all" },
  { href: "/hrms/performance", title: "Performance", permission: "performance.view_all" },
  { href: "/timesheet", title: "Timesheets", permission: "timesheet.view_all" },
  { href: "/team-calendar", title: "Team calendar", permission: "team_calendar.view" },
];

export default function HrmsHomePage() {
  const { data: me, error } = useSWR<{ user?: { role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const permissions = me?.permissions || {};
  const admin = me?.user?.role !== "employee" && ["employee_directory.manage", "salary.manage", "payroll.run"].some(key => permissions[key]);
  if (!me && !error) return <p className="p-4 text-sm">Loading HRMS…</p>;
  return <AccessGate permissionKey="dashboard.view">
    {!admin ? <HrmsSelfServiceHome /> : <ModulePageFrame title="HRMS" subtitle="Manage your people and monthly pay in one place.">
      <div className={UI.card + " p-5 mb-5"}>
        <h2 className="font-semibold">Start with the employee</h2>
        <p className="mt-2 text-sm text-[var(--ats-text-muted)]">Add employee → save salary setup → enable employee login → generate payslip.</p>
        <p className="mt-2 text-sm text-[var(--ats-text-muted)]">Employee details and salary setup are saved once. Each month, enter the days and preview the payslip.</p>
        <Link href="/employee/login" className="mt-3 inline-block text-sm text-teal-700 underline">Employee sign-in page</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {MAIN.filter(item => permissions[item.permission]).map(item => <Link key={item.href} href={item.href} className={UI.card + " p-5 hover:border-teal-500"}>
          <h2 className="font-semibold">{item.title}</h2><p className="mt-2 text-sm text-[var(--ats-text-muted)]">{item.text}</p>
        </Link>)}
      </div>
      <details className={UI.card + " mt-5 p-5"}><summary className="cursor-pointer font-semibold">More HR tools</summary>
        <div className="mt-4 flex flex-wrap gap-3">{MORE.filter(item => permissions[item.permission]).map(item => <Link href={item.href} key={item.href} className={UI.secondaryButton}>{item.title}</Link>)}</div>
      </details>
    </ModulePageFrame>}
  </AccessGate>;
}
