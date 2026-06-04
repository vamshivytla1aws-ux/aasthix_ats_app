"use client";

import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import StatusBadge from "@/components/enterprise/StatusBadge";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type SelfProfile = {
  employee_code: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  employment_type: string;
  joining_date: string | null;
  work_location: string;
  employment_status: string;
  reporting_manager_name: string;
  reporting_manager_email: string;
  profile_completeness: number;
};

function renderValue(value: string | null | undefined) {
  return value && String(value).trim() ? String(value) : "—";
}

export default function HrmsMyProfilePage() {
  const { data } = useSWR<{ profile: SelfProfile }>("/api/hrms/profile/me", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const profile = data?.profile;

  return (
    <AccessGate permissionKey="employee_directory.view_self">
      <ModulePageFrame
        title="My Employee Profile"
        subtitle="Read-only HRMS summary for your employee record."
        metrics={<StatusBadge status="View Only" />}
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <section className={UI.card + " p-4 xl:col-span-2"}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Employee code</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.employee_code)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Full name</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.full_name)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Email</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.email)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Phone</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.phone)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Department</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.department)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Designation</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.designation)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Employment type</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.employment_type)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Joining date</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.joining_date)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Work location</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.work_location)}</div>
              </div>
              <div className={UI.sectionCard + " p-3"}>
                <div className="text-xs text-[var(--ats-text-muted)]">Employment status</div>
                <div className="text-sm font-semibold capitalize text-[var(--ats-text)]">{renderValue(profile?.employment_status)}</div>
              </div>
            </div>
          </section>

          <aside className={UI.card + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Reporting</div>
            <div className="mt-3 rounded-lg border border-[var(--ats-border)] p-3">
              <div className="text-xs text-[var(--ats-text-muted)]">Manager</div>
              <div className="text-sm font-semibold text-[var(--ats-text)]">{renderValue(profile?.reporting_manager_name)}</div>
              <div className="text-xs text-[var(--ats-text-muted)] mt-1">{renderValue(profile?.reporting_manager_email)}</div>
            </div>

            <div className="mt-4 rounded-lg border border-[var(--ats-border)] p-3">
              <div className="text-xs text-[var(--ats-text-muted)]">Profile completeness</div>
              <div className="text-lg font-semibold text-[var(--ats-text)]">{profile?.profile_completeness ?? 0}%</div>
              <div className="text-xs text-[var(--ats-text-muted)] mt-1">
                Profile edits are controlled through HR or account settings.
              </div>
            </div>
          </aside>
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}
