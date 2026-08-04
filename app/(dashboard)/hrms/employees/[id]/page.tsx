"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Employee360SalaryTab from "@/components/hrms/Employee360SalaryTab";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

export default function Employee360ProfilePage({ params }: { params: { id: string } }) {
  const employeeId = Number(params.id);
  const [activeTab, setActiveTab] = React.useState<"overview" | "salary" | "attendance">("salary");

  const { data: empData, error } = useSWR<{ employees: any[] }>(
    `/api/hrms/employees?q=${employeeId}`,
    dashboardFetcher,
    { revalidateOnFocus: false }
  );

  const employee = React.useMemo(() => {
    return (empData?.employees || []).find((e) => e.id === employeeId);
  }, [empData?.employees, employeeId]);

  return (
    <AccessGate permissionKey="employee_directory.view_all">
      <ModulePageFrame
        title={employee?.full_name || "Employee Profile"}
        subtitle={employee ? `${employee.designation || "Role not set"} · ${employee.department || "No department"} · ${employee.employee_code || "No ID"}` : "Loading employee data..."}
      >
        <div className="flex border-b border-[var(--ats-border)] mb-6 overflow-x-auto">
          <button
            className={`px-4 py-3 font-semibold text-sm whitespace-nowrap transition border-b-2 ${
              activeTab === "overview"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            className={`px-4 py-3 font-semibold text-sm whitespace-nowrap transition border-b-2 ${
              activeTab === "salary"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveTab("salary")}
          >
            Salary & Payslips
          </button>
          <button
            className={`px-4 py-3 font-semibold text-sm whitespace-nowrap transition border-b-2 ${
              activeTab === "attendance"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveTab("attendance")}
          >
            Attendance & Leaves
          </button>
        </div>

        {activeTab === "overview" && (
          <div className={UI.card + " p-6 animate-in fade-in"}>
            <h3 className="text-lg font-bold text-[var(--ats-text)] mb-4">Employee Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-[var(--ats-text-muted)] mb-1">Full Name</p>
                <p className="font-medium text-[var(--ats-text)]">{employee?.full_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--ats-text-muted)] mb-1">Email</p>
                <p className="font-medium text-[var(--ats-text)]">{employee?.email || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--ats-text-muted)] mb-1">Phone</p>
                <p className="font-medium text-[var(--ats-text)]">{employee?.phone || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--ats-text-muted)] mb-1">Employment Type</p>
                <p className="font-medium text-[var(--ats-text)]">{employee?.employment_type || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--ats-text-muted)] mb-1">Work Location</p>
                <p className="font-medium text-[var(--ats-text)]">{employee?.work_location || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--ats-text-muted)] mb-1">Reporting Manager</p>
                <p className="font-medium text-[var(--ats-text)]">{employee?.reporting_manager_name || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--ats-text-muted)] mb-1">Employment Status</p>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${employee?.employment_status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {employee?.employment_status || "-"}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "salary" && (
          <Employee360SalaryTab employeeId={employeeId} />
        )}

        {activeTab === "attendance" && (
          <div className={UI.card + " p-6 flex flex-col items-center justify-center min-h-[300px] animate-in fade-in"}>
            <div className="text-slate-500 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--ats-text)]">Attendance & Leave Records</h3>
            <p className="text-sm text-[var(--ats-text-muted)] text-center max-w-sm mt-2">
              This module consolidates the employee&apos;s daily check-ins, leaves taken, and timesheet logs.
            </p>
          </div>
        )}

      </ModulePageFrame>
    </AccessGate>
  );
}
