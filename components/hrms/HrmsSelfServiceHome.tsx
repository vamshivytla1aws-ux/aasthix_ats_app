"use client";

import Link from "next/link";
import useSWR from "swr";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { employeeModules } from "@/lib/hrms/selfService";

type Profile = { full_name: string; employee_code: string; designation: string; department: string; reporting_manager_name: string; work_location: string };
type Leave = { balances: Array<{ remaining_days: number }>; requests: Array<{ status: string }> };

export default function HrmsSelfServiceHome() {
  const { data: me } = useSWR<{ user: { full_name: string }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const permissions = me?.permissions || {};
  const { data: profileData, error: profileError } = useSWR<{ profile: Profile }>(permissions["employee_directory.view_self"] ? "/api/hrms/profile/me" : null, dashboardFetcher);
  const { data: leaveData } = useSWR<Leave>(permissions["leave.view_self"] ? "/api/leave/dashboard/me" : null, dashboardFetcher);
  const profile = profileData?.profile;
  return <ModulePageFrame title="My HRMS" subtitle="Your details, payslips and everyday HR tasks.">
    <section className={UI.card + " p-5 mb-5"}>
      <h2 className="text-lg font-semibold">{profile?.full_name || me?.user?.full_name || "Welcome"}</h2>
      {profile && <><p className="mt-1 text-sm text-[var(--ats-text-muted)]">{[profile.employee_code, profile.designation, profile.department, profile.work_location].filter(Boolean).join(" · ")}</p>
        <p className="mt-2 text-sm">Reporting manager: {profile.reporting_manager_name || "Not assigned"}</p></>}
      {profileError && <p className="mt-2 text-sm text-rose-700">Your profile could not be loaded. Please try again or contact HR.</p>}
      {leaveData && <div className="mt-4 flex flex-wrap gap-5 text-sm"><span>Leave balance: <strong>{(leaveData.balances || []).reduce((sum, row) => sum + Number(row.remaining_days || 0), 0)} days</strong></span>
        <span>Pending leave requests: <strong>{(leaveData.requests || []).filter(row => row.status === "pending").length}</strong></span></div>}
    </section>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {employeeModules(permissions).filter(item => item.href !== "/hrms").map(item => <Link key={item.href} href={item.href} className={UI.card + " p-5 hover:border-teal-500"}>
        <h2 className="font-semibold">{item.title}</h2><p className="mt-2 text-sm text-[var(--ats-text-muted)]">{item.subtitle}</p>
      </Link>)}
    </div>
    <p className="mt-5 text-sm text-[var(--ats-text-muted)]">Your HR team manages your details and access. Contact HR for corrections.</p>
  </ModulePageFrame>;
}
