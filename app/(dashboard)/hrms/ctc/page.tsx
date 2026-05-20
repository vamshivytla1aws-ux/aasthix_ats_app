"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

type EmployeeOption = {
  id: number;
  full_name: string;
  email: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  joining_date?: string;
  work_location?: string;
};
type CtcHistoryRow = {
  id: number;
  ctc_annual: number;
  effective_from: string | null;
  salary_month: string | null;
  department: string;
  designation: string;
  work_location: string;
};

function ymToMonthLabel(value: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

function inr(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function HrmsCtcPage() {
  const [employeeId, setEmployeeId] = React.useState(0);
  const [effectiveMonth, setEffectiveMonth] = React.useState(monthStart());
  const [ctcAnnual, setCtcAnnual] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [workLocation, setWorkLocation] = React.useState("");
  const [employeeCode, setEmployeeCode] = React.useState("");
  const [editingVersionId, setEditingVersionId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" | "info" } | null>(null);

  const employeesSwr = useSWR<{ employees: EmployeeOption[] }>("/api/salary-structures", dashboardFetcher, { revalidateOnFocus: false });
  const historySwr = useSWR<{ history: CtcHistoryRow[] }>(
    employeeId > 0 ? `/api/hrms/ctc/${employeeId}/history` : null,
    dashboardFetcher,
    { revalidateOnFocus: false },
  );

  const selectedEmployee = (employeesSwr.data?.employees || []).find((emp) => emp.id === employeeId);

  React.useEffect(() => {
    if (!selectedEmployee) return;
    setEmployeeCode(String(selectedEmployee.employee_code || ""));
    setDepartment(String(selectedEmployee.department || ""));
    setDesignation(String(selectedEmployee.designation || ""));
    setWorkLocation(String(selectedEmployee.work_location || ""));
  }, [selectedEmployee]);

  React.useEffect(() => {
    const head = historySwr.data?.history?.[0];
    if (!head) return;
    setCtcAnnual(String(Number(head.ctc_annual || 0)));
    setEffectiveMonth(head.effective_from || monthStart());
    setDepartment(String(head.department || ""));
    setDesignation(String(head.designation || ""));
    setWorkLocation(String(head.work_location || ""));
    if (!editingVersionId) setEditingVersionId(Number(head.id));
  }, [historySwr.data?.history, editingVersionId]);

  async function saveNewVersion() {
    if (employeeId <= 0) return setToast({ message: "Select employee first.", variant: "blocked" });
    if (!Number.isFinite(Number(ctcAnnual)) || Number(ctcAnnual) <= 0) {
      return setToast({ message: "Enter valid CTC annual.", variant: "blocked" });
    }
    setBusy(true);
    try {
      const res = await apiFetchJson<{ operation_status?: string; user_message?: string }>("/api/hrms/ctc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          employeeCode,
          department: department || null,
          designation: designation || null,
          workLocation: workLocation || null,
          ctcAnnual: Number(ctcAnnual),
          salaryMonth: effectiveMonth,
          totalPaidDays: 0,
          lopDays: 0,
          taxRegime: "new_regime",
          manualTdsAnnual: null,
          professionalTaxMonthly: 200,
          pfEnabled: true,
          employerPfIncludedInCtc: true,
          employeePfEnabled: true,
          healthInsuranceEnabled: false,
          healthInsuranceAnnual: 0,
        }),
      });
      setToast({ message: res.user_message || "CTC version saved.", variant: res.operation_status === "blocked" ? "blocked" : "success" });
      setEditingVersionId(null);
      await historySwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save CTC version.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function updateVersion() {
    if (!editingVersionId) return setToast({ message: "Select a history row to edit.", variant: "blocked" });
    if (!Number.isFinite(Number(ctcAnnual)) || Number(ctcAnnual) <= 0) {
      return setToast({ message: "Enter valid CTC annual.", variant: "blocked" });
    }
    setBusy(true);
    try {
      const res = await apiFetchJson<{ operation_status?: string; user_message?: string }>(`/api/hrms/ctc/${editingVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctcAnnual: Number(ctcAnnual), effectiveFrom: effectiveMonth }),
      });
      setToast({ message: res.user_message || "CTC version updated.", variant: res.operation_status === "blocked" ? "blocked" : "success" });
      await historySwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update CTC version.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessGate permissionKey="salary.view">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1600} /> : null}
      <ModulePageFrame title="CTC Management" subtitle="Manage month-wise CTC versions and history per employee.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={UI.label}>
              Employee
              <select className={UI.select} value={employeeId ? String(employeeId) : ""} onChange={(e) => setEmployeeId(Number(e.target.value || 0))}>
                <option value="">Select employee</option>
                {(employeesSwr.data?.employees || []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.email})
                  </option>
                ))}
              </select>
            </label>
            <label className={UI.label}>
              Effective Month
              <input
                type="month"
                className={UI.input}
                value={effectiveMonth.slice(0, 7)}
                onChange={(e) => setEffectiveMonth(`${e.target.value}-01`)}
              />
            </label>
            <label className={UI.label}>
              CTC Annual
              <input className={UI.input} type="number" min={1} value={ctcAnnual} onChange={(e) => setCtcAnnual(e.target.value)} />
            </label>
            <label className={UI.label}>Employee Code<input className={UI.input} value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} /></label>
            <label className={UI.label}>Department<input className={UI.input} value={department} onChange={(e) => setDepartment(e.target.value)} /></label>
            <label className={UI.label}>Designation<input className={UI.input} value={designation} onChange={(e) => setDesignation(e.target.value)} /></label>
            <label className={UI.label + " md:col-span-3"}>Work Location<input className={UI.input} value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} disabled={busy || !employeeId} onClick={() => void saveNewVersion()}>
              Save New CTC Version
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-sm"} disabled={busy || !editingVersionId} onClick={() => void updateVersion()}>
              Update Selected Version
            </button>
          </div>
          <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
            {selectedEmployee ? `Managing CTC for ${selectedEmployee.full_name}` : "Select an employee to view CTC history."}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={UI.secondaryButton + " py-2 text-sm"} href="/hrms/payroll">
              Open Payroll Control
            </a>
            <a className={UI.secondaryButton + " py-2 text-sm"} href="/salary">
              Open Salary / Payslips
            </a>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">CTC History</h2>
          {historySwr.data?.history?.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Effective Month</th>
                    <th className="px-3 py-2 text-left">CTC Annual</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Designation</th>
                    <th className="px-3 py-2 text-left">Location</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historySwr.data.history.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--ats-border)]">
                      <td className="px-3 py-2">{ymToMonthLabel(row.effective_from)}</td>
                      <td className="px-3 py-2">{inr(row.ctc_annual)}</td>
                      <td className="px-3 py-2">{row.department || "-"}</td>
                      <td className="px-3 py-2">{row.designation || "-"}</td>
                      <td className="px-3 py-2">{row.work_location || "-"}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className={UI.secondaryButton + " py-1 text-xs"}
                          onClick={() => {
                            setEditingVersionId(row.id);
                            setCtcAnnual(String(row.ctc_annual));
                            setEffectiveMonth(row.effective_from || monthStart());
                            setDepartment(String(row.department || ""));
                            setDesignation(String(row.designation || ""));
                            setWorkLocation(String(row.work_location || ""));
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 text-sm text-[var(--ats-text-muted)]">No CTC versions yet for this employee.</div>
          )}
        </section>
      </ModulePageFrame>
    </AccessGate>
  );
}
