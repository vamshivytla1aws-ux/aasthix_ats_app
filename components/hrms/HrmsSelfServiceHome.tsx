"use client";

import Link from "next/link";
import useSWR from "swr";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import StatusBadge from "@/components/enterprise/StatusBadge";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type SelfProfile = {
  id: number;
  employee_code: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  reporting_manager_name: string;
  work_location: string;
  profile_completeness: number;
};

type LeaveDashboard = {
  balances: Array<{ leave_type: string; remaining_days: number }>;
  requests: Array<{ id: number; status: string }>;
  holidays: Array<{ id: number }>;
};

const SELF_MODULES = [
  { href: "/hrms/my-profile", title: "My Profile", subtitle: "View your employee profile, reporting manager, and work information." },
  { href: "/salary", title: "Pay", subtitle: "Open monthly payslips and your yearly salary statement." },
  { href: "/leave", title: "Leave", subtitle: "Track balances, apply for leave, and view holidays and leave calendar." },
  { href: "/attendance", title: "Attendance", subtitle: "Check in, check out, and review your recent attendance records." },
  { href: "/timesheet", title: "Timesheet", subtitle: "Capture daily work logs and review your submitted entries." },
  { href: "/team-calendar", title: "Calendar", subtitle: "Open your team calendar for meeting visibility and planning." },
] as const;

export default function HrmsSelfServiceHome() {
  const { data: profileData } = useSWR<{ profile: SelfProfile }>("/api/hrms/profile/me", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const { data: leaveData } = useSWR<LeaveDashboard>("/api/leave/dashboard/me", dashboardFetcher, {
    revalidateOnFocus: false,
  });

  const profile = profileData?.profile;
  const balances = leaveData?.balances || [];
  const totalRemaining = balances.reduce((sum, row) => sum + Number(row.remaining_days || 0), 0);
  const pendingRequests = (leaveData?.requests || []).filter((row) => row.status === "pending").length;
  const holidays = leaveData?.holidays?.length || 0;

  return (
    <ModulePageFrame
      title="My HRMS"
      subtitle="Self-service workspace for your employee profile, pay, leave, and timesheet."
      metrics={<StatusBadge status="Self Service" />}
    >
      <div className={UI.card + " p-4 mb-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-[var(--ats-text)]">{profile?.full_name || "Employee"}</div>
            <div className="text-sm text-[var(--ats-text-muted)]">
              {profile?.designation || "Role not set"}
              {profile?.department ? ` · ${profile.department}` : ""}
              {profile?.work_location ? ` · ${profile.work_location}` : ""}
            </div>
            <div className="mt-1 text-xs text-[var(--ats-text-muted)]">
              Manager: {profile?.reporting_manager_name || "Not assigned"}
            </div>
          </div>
          <Link href="/hrms/my-profile" className={UI.secondaryButton + " py-2 text-sm"}>
            View profile
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-4">
          <div className="rounded-lg border border-[var(--ats-border)] p-3">
            <div className="text-xs text-[var(--ats-text-muted)]">Profile completeness</div>
            <div className="text-lg font-semibold text-[var(--ats-text)]">{profile?.profile_completeness ?? 0}%</div>
            <div className="text-xs text-[var(--ats-text-muted)]">Read-only summary</div>
          </div>
          <div className="rounded-lg border border-[var(--ats-border)] p-3">
            <div className="text-xs text-[var(--ats-text-muted)]">Leave balance</div>
            <div className="text-lg font-semibold text-[var(--ats-text)]">{totalRemaining.toFixed(2)} days</div>
            <div className="text-xs text-[var(--ats-text-muted)]">Across all leave buckets</div>
          </div>
          <div className="rounded-lg border border-[var(--ats-border)] p-3">
            <div className="text-xs text-[var(--ats-text-muted)]">Pending leave requests</div>
            <div className="text-lg font-semibold text-[var(--ats-text)]">{pendingRequests}</div>
            <div className="text-xs text-[var(--ats-text-muted)]">Waiting for decision</div>
          </div>
          <div className="rounded-lg border border-[var(--ats-border)] p-3">
            <div className="text-xs text-[var(--ats-text-muted)]">Holiday list</div>
            <div className="text-lg font-semibold text-[var(--ats-text)]">{holidays}</div>
            <div className="text-xs text-[var(--ats-text-muted)]">Configured holidays visible to you</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SELF_MODULES.map((item) => (
          <Link key={item.href} href={item.href} className={UI.card + " p-4 transition hover:border-[var(--ats-accent)]"}>
            <div className="text-base font-semibold text-[var(--ats-text)]">{item.title}</div>
            <div className="mt-1 text-sm text-[var(--ats-text-muted)]">{item.subtitle}</div>
          </Link>
        ))}
      </div>
    </ModulePageFrame>
  );
}
