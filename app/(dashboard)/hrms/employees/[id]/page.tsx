"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Employee360SalaryTab from "@/components/hrms/Employee360SalaryTab";
import EmployeeLoginSetup from "@/components/hrms/EmployeeLoginSetup";
import EmployeeProfileEditor, { type EditableEmployee } from "@/components/hrms/EmployeeProfileEditor";
import EmployeeFeatureControls from "@/components/hrms/EmployeeFeatureControls";
import EmployeeDocumentsPanel from "@/components/hrms/EmployeeDocumentsPanel";
import EmployeeMonthlyRecords from "@/components/hrms/EmployeeMonthlyRecords";
import CorrectionRequests from "@/components/hrms/CorrectionRequests";
import { dashboardFetcher } from "@/lib/swrFetcher";
import type { EmployeeSetup } from "@/lib/hrms/employeeSetup";
import { UI } from "@/lib/ui";

type Employee = EditableEmployee & { reporting_manager_name?: string };
type Tab = "details" | "login" | "salary" | "documents" | "attendance";
const labels: Record<Tab, string> = { details: "Details", login: "Login & Access", salary: "Salary & Payslips", documents: "Documents", attendance: "Attendance & Leave" };

export default function Employee360ProfilePage({ params }: { params: { id: string } }) {
  const employeeId = Number(params.id);
  const [activeTab, setActiveTab] = React.useState<Tab>("details");
  const { data: me } = useSWR<{ user: { role: string }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const permissions = React.useMemo(() => me?.permissions || {}, [me?.permissions]);
  const { data: empData, error, mutate: refreshEmployee } = useSWR<{ employees: Employee[] }>(permissions["employee_directory.view_all"] ? "/api/hrms/employees" : null, dashboardFetcher);
  const { data: setup, error: setupError, mutate: refreshSetup } = useSWR<EmployeeSetup>(permissions["employee_directory.view_all"] ? `/api/hrms/employees/${employeeId}/setup` : null, dashboardFetcher);
  const employee = empData?.employees?.find(item => Number(item.id) === employeeId);
  const tabs = React.useMemo(() => (["details", "login", ...(permissions["salary.view"] ? ["salary"] : []),
    ...(permissions["documents.view_all"] ? ["documents"] : []), "attendance"] as Tab[]), [permissions]);
  React.useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (selected && tabs.includes(selected)) setActiveTab(selected);
  }, [tabs]);
  function selectTab(tab: Tab) {
    if (!tabs.includes(tab)) return;
    setActiveTab(tab);
    const url = new URL(window.location.href); url.searchParams.set("tab", tab); window.history.replaceState(null, "", url);
  }
  async function updated() { await refreshEmployee(); await refreshSetup(); }
  return <AccessGate permissionKey="employee_directory.view_all">
    {!Number.isInteger(employeeId) || employeeId <= 0 ? <p>Invalid employee.</p> : error ? <p role="alert">Unable to load this employee. Please try again.</p> : !empData ? <p>Loading employee…</p> : !employee ? <p>Employee not found.</p> : <ModulePageFrame
      title={employee.full_name} subtitle={[employee.designation, employee.department, employee.employee_code].filter(Boolean).join(" · ")}>
      <section aria-label="Employee setup checklist" className={UI.card + " p-5 mb-5"}>
        <h2 className="font-semibold">Employee setup</h2>
        <p className="mt-1 text-sm text-[var(--ats-text-muted)]">Complete details → enable login → save salary → generate payslip.</p>
        {setupError ? <p role="alert" className="mt-3 text-sm">Setup status could not be loaded. Open the sections below or try again.</p> : !setup?.items ? <p className="mt-3 text-sm">Checking setup…</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {setup.items.map(item => <button type="button" key={item.key} disabled={!tabs.includes(item.key)} aria-label={`Open ${item.label}`} onClick={() => selectTab(item.key)} className="rounded-xl border border-[var(--ats-border)] p-3 text-left disabled:opacity-60">
            <span className="block font-medium">{item.label}</span>
            <span className={`mt-1 block text-sm ${item.status === "needs_attention" ? "text-amber-700" : "text-[var(--ats-text-muted)]"}`}>{({ complete: "Complete", needs_attention: "Needs attention", optional: "Optional", unavailable: "Access not enabled" })[item.status]}</span>
            <span className="mt-2 block text-xs text-[var(--ats-text-muted)]">{item.detail}</span>
          </button>)}
        </div>}
      </section>
      <nav aria-label="Employee profile sections" className="mb-5 flex gap-2 overflow-x-auto border-b border-[var(--ats-border)] pb-2">
        {tabs.map(tab => <button key={tab} type="button" aria-current={activeTab === tab ? "page" : undefined} onClick={() => selectTab(tab)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === tab ? "bg-teal-700 text-white" : "text-[var(--ats-text-muted)]"}`}>{labels[tab]}</button>)}
      </nav>
      <div hidden={activeTab !== "details"}>
        <EmployeeProfileEditor key={employeeId} employee={employee} onUpdated={updated} />
        <section className={UI.card + " p-5"}><h2 className="font-semibold">Employee details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[["Name", employee.full_name], ["Email", employee.email], ["Employee code", employee.employee_code], ["Phone", employee.phone], ["Department", employee.department], ["Designation", employee.designation], ["Employment type", employee.employment_type], ["Date of joining", employee.joining_date], ["Work location", employee.work_location], ["Reporting manager", employee.reporting_manager_name], ["Employment status", employee.employment_status]].map(([label, value]) => <div key={label}><p className="text-xs text-[var(--ats-text-muted)]">{label}</p><p className="mt-1 text-sm font-medium">{value || "Not added"}</p></div>)}
          </div>
        </section>
        {activeTab === "details" && <CorrectionRequests key={employeeId} category="profile" employeeId={employeeId} canClose={permissions["employee_directory.manage"] === true} />}
      </div>
      <div hidden={activeTab !== "login"}>
        <EmployeeLoginSetup key={employeeId} employeeId={employeeId} expanded />
        {setup?.features && <EmployeeFeatureControls employeeId={employeeId} features={setup.features} canManage={setup.canManageAccess} onUpdated={() => refreshSetup()} />}
      </div>
      {permissions["salary.view"] && <div hidden={activeTab !== "salary"}>
        <Employee360SalaryTab key={employeeId} employeeId={employeeId} employee={{ ...employee, role: employee.role || "employee" }} canManage={permissions["salary.manage"] === true} />
        {activeTab === "salary" && <div key={employeeId} className="grid gap-4 lg:grid-cols-2">
          <CorrectionRequests category="salary" employeeId={employeeId} canClose={permissions["salary.manage"] === true} />
          <CorrectionRequests category="payslip" employeeId={employeeId} canClose={permissions["salary.manage"] === true} />
        </div>}
      </div>}
      {permissions["documents.view_all"] && <div hidden={activeTab !== "documents"}><EmployeeDocumentsPanel key={employeeId} employeeId={employeeId} canManage={permissions["documents.manage"] === true} /></div>}
      <div hidden={activeTab !== "attendance"}><EmployeeMonthlyRecords key={employeeId} employeeId={employeeId} enabled={activeTab === "attendance"} /></div>
    </ModulePageFrame>}
  </AccessGate>;
}
