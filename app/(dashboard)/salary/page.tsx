"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import SelfServiceSalaryView from "@/components/hrms/SelfServiceSalaryView";
import StatusBadge from "@/components/enterprise/StatusBadge";
import Toast from "@/components/Toast";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { getMonthDaysFromDateString } from "@/lib/salary/monthDays";
import { hasHrmsManagementAccess } from "@/lib/dashboardNavConfig";

type EmployeeOption = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  joining_date?: string;
  work_location?: string;
};
type SalaryComponent = { key: string; name: string; type: "earning" | "deduction"; annual: number; monthly: number; amountForMonth?: number };
type SalaryCalculation = {
  earningsAnnual: SalaryComponent[];
  deductionsAnnual: SalaryComponent[];
  taxableIncome: number;
  annualTax: number;
  monthlyTds: number;
  grossMonthlySalary: number;
  totalMonthlyDeductions: number;
  netMonthlySalary: number;
  defined_work_days: number;
  day_wise_ctc: number;
  payable_days: number;
  prorated_monthly_ctc: number;
  netSalaryInWords: string;
  summary: {
    ctcAnnual: number;
  };
};

type PayslipRow = {
  id: number;
  month: number;
  year: number;
  gross_monthly: number;
  total_deductions: number;
  net_salary: number;
  generated_at: string;
};

function inr(n: number) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayMonthDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function AdminSalaryPage() {
  const [toast, setToast] = React.useState<{ message: string; variant?: "success" | "error" | "blocked" | "info" } | null>(null);
  const [calculation, setCalculation] = React.useState<SalaryCalculation | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [employeeId, setEmployeeId] = React.useState<number>(0);
  const [employeeCode, setEmployeeCode] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [dateOfJoining, setDateOfJoining] = React.useState("");
  const [pan, setPan] = React.useState("");
  const [uanNumber, setUanNumber] = React.useState("");
  const [pfNumber, setPfNumber] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [workLocation, setWorkLocation] = React.useState("");
  const [ctcAnnual, setCtcAnnual] = React.useState("1600000");
  const [salaryMonth, setSalaryMonth] = React.useState(todayMonthDate());
  const [totalPaidDays, setTotalPaidDays] = React.useState(String(getMonthDaysFromDateString(todayMonthDate())));
  const [definedWorkDays, setDefinedWorkDays] = React.useState(String(getMonthDaysFromDateString(todayMonthDate())));
  const [lopDays, setLopDays] = React.useState("0");
  const [taxRegime, setTaxRegime] = React.useState<"new_regime" | "old_regime" | "manual_tds">("new_regime");
  const [manualTdsAnnual, setManualTdsAnnual] = React.useState("");
  const [professionalTaxMonthly, setProfessionalTaxMonthly] = React.useState("200");
  const [pfEnabled, setPfEnabled] = React.useState(true);
  const [employerPfIncludedInCtc, setEmployerPfIncludedInCtc] = React.useState(true);
  const [employeePfEnabled, setEmployeePfEnabled] = React.useState(true);
  const [healthInsuranceEnabled, setHealthInsuranceEnabled] = React.useState(false);
  const [healthInsuranceAnnual, setHealthInsuranceAnnual] = React.useState("0");

  const employeesSwr = useSWR<{ employees: EmployeeOption[] }>("/api/salary-structures", dashboardFetcher, { revalidateOnFocus: false });
  const hrmsSummarySwr = useSWR<{ summary: { payroll?: { status?: string } } }>("/api/hrms/summary", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const payslipsSwr = useSWR<{ payslips: PayslipRow[] }>(
    employeeId > 0 ? `/api/payslips/${employeeId}` : null,
    dashboardFetcher,
    { revalidateOnFocus: false }
  );
  const structureSwr = useSWR<{ structure: any }>(
    employeeId > 0 ? `/api/salary-structures/${employeeId}` : null,
    dashboardFetcher,
    { revalidateOnFocus: false }
  );

  const selectedEmployee = (employeesSwr.data?.employees || []).find((e) => e.id === employeeId);

  React.useEffect(() => {
    if (!selectedEmployee || employeeId <= 0) return;
    setEmployeeCode(String(selectedEmployee.employee_code || ""));
    setDepartment(String(selectedEmployee.department || ""));
    setDesignation(String(selectedEmployee.designation || ""));
    setDateOfJoining(String(selectedEmployee.joining_date || ""));
    setWorkLocation(String(selectedEmployee.work_location || ""));
  }, [employeeId, selectedEmployee]);

  React.useEffect(() => {
    const structure = structureSwr.data?.structure;
    if (!structure || employeeId <= 0) return;
    setEmployeeCode(String(structure.employee_code || ""));
    setDepartment(String(structure.department || ""));
    setDesignation(String(structure.designation || ""));
    setDateOfJoining(structure.date_of_joining ? String(structure.date_of_joining).slice(0, 10) : "");
    setPan(String(structure.pan || ""));
    setUanNumber(String(structure.uan_number || ""));
    setPfNumber(String(structure.pf_number || ""));
    setBankAccountNumber(String(structure.bank_account_number || ""));
    setWorkLocation(String(structure.work_location || ""));
    setCtcAnnual(String(Number(structure.ctc_annual || 0)));
    const nextSalaryMonth = structure.salary_month ? String(structure.salary_month).slice(0, 10) : todayMonthDate();
    setSalaryMonth(nextSalaryMonth);
    setDefinedWorkDays(String(Number(structure.defined_work_days || structure.total_paid_days || getMonthDaysFromDateString(nextSalaryMonth))));
    setTotalPaidDays(String(Number(structure.total_paid_days || getMonthDaysFromDateString(nextSalaryMonth))));
    setLopDays(String(Number(structure.lop_days || 0)));
    setTaxRegime((String(structure.tax_regime || "new_regime") as "new_regime" | "old_regime" | "manual_tds"));
    setManualTdsAnnual(structure.manual_tds_annual == null ? "" : String(Number(structure.manual_tds_annual)));
    setProfessionalTaxMonthly(String(Number(structure.professional_tax_monthly || 200)));
    setPfEnabled(Boolean(structure.pf_enabled));
    setEmployerPfIncludedInCtc(Boolean(structure.employer_pf_included_in_ctc));
    setEmployeePfEnabled(Boolean(structure.employee_pf_enabled));
    setHealthInsuranceEnabled(Boolean(structure.health_insurance_enabled));
    setHealthInsuranceAnnual(String(Number(structure.health_insurance_annual || 0)));
  }, [employeeId, structureSwr.data?.structure]);

  const payload = React.useMemo(
    () => ({
      employeeId,
      employeeName: selectedEmployee?.full_name || "",
      employeeCode,
      department,
      designation,
      dateOfJoining: dateOfJoining || null,
      pan: pan || null,
      uanNumber: uanNumber || null,
      pfNumber: pfNumber || null,
      bankAccountNumber: bankAccountNumber || null,
      workLocation: workLocation || null,
      ctcAnnual: Number(ctcAnnual || 0),
      salaryMonth,
      definedWorkDays: Number(definedWorkDays || 0),
      totalPaidDays: Number(totalPaidDays || 0),
      lopDays: Number(lopDays || 0),
      taxRegime,
      manualTdsAnnual: manualTdsAnnual ? Number(manualTdsAnnual) : null,
      professionalTaxMonthly: professionalTaxMonthly ? Number(professionalTaxMonthly) : 200,
      pfEnabled,
      employerPfIncludedInCtc,
      employeePfEnabled,
      healthInsuranceEnabled,
      healthInsuranceAnnual: healthInsuranceAnnual ? Number(healthInsuranceAnnual) : 0,
    }),
    [
      employeeId,
      selectedEmployee?.full_name,
      employeeCode,
      department,
      designation,
      dateOfJoining,
      pan,
      uanNumber,
      pfNumber,
      bankAccountNumber,
      workLocation,
      ctcAnnual,
      salaryMonth,
      definedWorkDays,
      totalPaidDays,
      lopDays,
      taxRegime,
      manualTdsAnnual,
      professionalTaxMonthly,
      pfEnabled,
      employerPfIncludedInCtc,
      employeePfEnabled,
      healthInsuranceEnabled,
      healthInsuranceAnnual,
    ]
  );

  async function calculatePreview() {
    if (employeeId <= 0) return setToast({ message: "Please select employee", variant: "blocked" });
    setBusy(true);
    try {
      const data = await apiFetchJson<{ calculation: SalaryCalculation }>("/api/salary-structures/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setCalculation(data.calculation);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to calculate", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveStructure() {
    if (employeeId <= 0) return setToast({ message: "Please select employee", variant: "blocked" });
    setBusy(true);
    try {
      const data = await apiFetchJson<{ calculation: SalaryCalculation }>("/api/salary-structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setCalculation(data.calculation);
      setToast({ message: "Salary structure saved.", variant: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save salary structure", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function generatePayslip() {
    if (employeeId <= 0) return setToast({ message: "Please select employee", variant: "blocked" });
    setBusy(true);
    try {
      const d = new Date(salaryMonth);
      const response = await apiFetchJson<{ operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string }>("/api/payslips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          month: d.getMonth() + 1,
          year: d.getFullYear(),
          paidDays: Number(totalPaidDays || 0),
          lopDays: Number(lopDays || 0),
        }),
      });
      setToast({
        message: response.user_message || "Payslip generated successfully.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await payslipsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to generate payslip", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function deletePayslip(payslipId: number) {
    const confirmed = window.confirm("Delete this payslip permanently?");
    if (!confirmed) return;
    setBusy(true);
    try {
      const response = await apiFetchJson<{ operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string }>(
        `/api/payslips/${payslipId}`,
        { method: "DELETE" },
      );
      setToast({
        message: response.user_message || "Payslip deleted.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await payslipsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to delete payslip", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessGate permissionKey="salary.view">
      {toast ? <Toast message={toast.message} variant={toast.variant || "success"} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame
        title="Salary Structure & Payslip"
        subtitle="Configure employee CTC, calculate salary components, and generate branded monthly payslips."
        metrics={<StatusBadge status="IST payroll context" />}
      >
        <section className={UI.card + " p-3 mb-4 bg-[var(--ats-fill-1)]"}>
          <div className="text-sm text-[var(--ats-text)]">
            Guided path: set month-effective CTC in <a className="underline" href="/hrms/ctc">CTC Management</a>, then run payroll in{" "}
            <a className="underline" href="/hrms/payroll">Payroll Control</a>, then generate/download payslips here.
          </div>
          {hrmsSummarySwr.data?.summary?.payroll?.status === "locked" ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Current payroll month is locked. Payslip regenerate will be blocked until unlock.
            </div>
          ) : null}
        </section>
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
            <label className={UI.label}>Employee Code<input className={UI.input} value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} /></label>
            <label className={UI.label}>Department<input className={UI.input} value={department} onChange={(e) => setDepartment(e.target.value)} /></label>
            <label className={UI.label}>Designation<input className={UI.input} value={designation} onChange={(e) => setDesignation(e.target.value)} /></label>
            <label className={UI.label}>Date of Joining<input type="date" className={UI.input} value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} /></label>
            <label className={UI.label}>PAN<input className={UI.input} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} /></label>
            <label className={UI.label}>UAN Number<input className={UI.input} value={uanNumber} onChange={(e) => setUanNumber(e.target.value)} /></label>
            <label className={UI.label}>PF Number<input className={UI.input} value={pfNumber} onChange={(e) => setPfNumber(e.target.value)} /></label>
            <label className={UI.label}>Bank Account Number<input className={UI.input} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} /></label>
            <label className={UI.label}>Work Location<input className={UI.input} value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} /></label>
            <label className={UI.label}>CTC Annual<input className={UI.input} type="number" min={1} value={ctcAnnual} onChange={(e) => setCtcAnnual(e.target.value)} /></label>
            <label className={UI.label}>Salary Month<input type="month" className={UI.input} value={salaryMonth.slice(0, 7)} onChange={(e) => {
              const next = `${e.target.value}-01`;
              setSalaryMonth(next);
              setDefinedWorkDays(String(getMonthDaysFromDateString(next)));
              setTotalPaidDays(String(getMonthDaysFromDateString(next)));
            }} /></label>
            <label className={UI.label}>Defined Work Days<input className={UI.input} type="number" min={1} value={definedWorkDays} onChange={(e) => setDefinedWorkDays(e.target.value)} /></label>
            <label className={UI.label}>Total Paid Days<input className={UI.input} type="number" min={0} value={totalPaidDays} onChange={(e) => setTotalPaidDays(e.target.value)} /></label>
            <label className={UI.label}>LOP Days<input className={UI.input} type="number" min={0} value={lopDays} onChange={(e) => setLopDays(e.target.value)} /></label>
            <label className={UI.label}>
              Tax Regime
              <select className={UI.select} value={taxRegime} onChange={(e) => setTaxRegime(e.target.value as any)}>
                <option value="new_regime">New Regime</option>
                <option value="old_regime">Old Regime</option>
                <option value="manual_tds">Manual TDS</option>
              </select>
            </label>
            <label className={UI.label}>Manual TDS Annual<input className={UI.input} type="number" min={0} value={manualTdsAnnual} onChange={(e) => setManualTdsAnnual(e.target.value)} /></label>
            <label className={UI.label}>Professional Tax Monthly<input className={UI.input} type="number" min={0} value={professionalTaxMonthly} onChange={(e) => setProfessionalTaxMonthly(e.target.value)} /></label>
            <label className={UI.label}>Health Insurance Annual<input className={UI.input} type="number" min={0} value={healthInsuranceAnnual} onChange={(e) => setHealthInsuranceAnnual(e.target.value)} /></label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={pfEnabled} onChange={(e) => setPfEnabled(e.target.checked)} /> PF enabled</label>
            <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={employerPfIncludedInCtc} onChange={(e) => setEmployerPfIncludedInCtc(e.target.checked)} /> Employer PF included in CTC</label>
            <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={employeePfEnabled} onChange={(e) => setEmployeePfEnabled(e.target.checked)} /> Employee PF enabled</label>
            <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={healthInsuranceEnabled} onChange={(e) => setHealthInsuranceEnabled(e.target.checked)} /> Health insurance enabled</label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={() => void calculatePreview()} disabled={busy}>Calculate</button>
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void saveStructure()} disabled={busy}>Save Salary Structure</button>
            <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={() => void generatePayslip()} disabled={busy}>Generate Payslip PDF</button>
          </div>
        </section>

        {calculation ? (
          <section className={UI.card + " mt-4 p-4 sm:p-5"}>
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Salary Preview</h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-[var(--ats-border)]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr><th className="px-3 py-2 text-left">Earnings</th><th className="px-3 py-2 text-right">Annual</th><th className="px-3 py-2 text-right">Monthly</th></tr>
                  </thead>
                  <tbody>
                    {calculation.earningsAnnual.map((row) => (
                      <tr key={row.key} className="border-t border-[var(--ats-border)]">
                        <td className="px-3 py-2">{row.name}</td><td className="px-3 py-2 text-right">{inr(row.annual)}</td><td className="px-3 py-2 text-right">{inr(row.monthly)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--ats-border)]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr><th className="px-3 py-2 text-left">Deductions</th><th className="px-3 py-2 text-right">Annual</th><th className="px-3 py-2 text-right">Monthly</th></tr>
                  </thead>
                  <tbody>
                    {calculation.deductionsAnnual.map((row) => (
                      <tr key={row.key} className="border-t border-[var(--ats-border)]">
                        <td className="px-3 py-2">{row.name}</td><td className="px-3 py-2 text-right">{inr(row.annual)}</td><td className="px-3 py-2 text-right">{inr(row.monthly)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-[var(--ats-border)] bg-slate-50 p-3 text-sm">
              <div>CTC: {inr(calculation.summary.ctcAnnual)}</div>
              <div>Defined Work Days: {calculation.defined_work_days}</div>
              <div>Day-wise CTC: {inr(calculation.day_wise_ctc)}</div>
              <div>Payable Days: {calculation.payable_days}</div>
              <div>Prorated Monthly CTC: {inr(calculation.prorated_monthly_ctc)}</div>
              <div>Gross Monthly: {inr(calculation.grossMonthlySalary)}</div>
              <div>Total Deductions: {inr(calculation.totalMonthlyDeductions)}</div>
              <div>Net Salary: {inr(calculation.netMonthlySalary)}</div>
              <div>Net Salary in Words: {calculation.netSalaryInWords}</div>
            </div>
          </section>
        ) : null}

        {employeeId > 0 ? (
          <section className={UI.card + " mt-4 p-4 sm:p-5"}>
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Payslips</h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--ats-border)]">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Deductions</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(payslipsSwr.data?.payslips || []).map((row) => (
                    <tr key={row.id} className="border-t border-[var(--ats-border)]">
                      <td className="px-3 py-2">{new Date(Date.UTC(row.year, row.month - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-2 text-right">{inr(row.gross_monthly)}</td>
                      <td className="px-3 py-2 text-right">{inr(row.total_deductions)}</td>
                      <td className="px-3 py-2 text-right">{inr(row.net_salary)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <a className="text-blue-700 hover:underline" href={`/api/payslips/${row.id}/download`}>Download PDF</a>
                          <button
                            type="button"
                            className="text-red-600 hover:underline disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void deletePayslip(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(payslipsSwr.data?.payslips || []).length === 0 ? (
                    <tr><td className="px-3 py-3 text-slate-500" colSpan={5}>No payslips generated yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </ModulePageFrame>
    </AccessGate>
  );
}

export default function SalaryPage() {
  const { data: me } = useSWR<{ user?: { role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const role = String(me?.user?.role || "user").toLowerCase();
  const isManagerView = hasHrmsManagementAccess(role, me?.permissions || {});

  return (
    <AccessGate permissionKey="salary.view">
      {isManagerView ? <AdminSalaryPage /> : <SelfServiceSalaryView />}
    </AccessGate>
  );
}
