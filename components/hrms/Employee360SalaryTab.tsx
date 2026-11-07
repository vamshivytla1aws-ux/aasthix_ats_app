"use client";

import React from "react";
import useSWR, { useSWRConfig } from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import SelfServiceSalaryView from "@/components/hrms/SelfServiceSalaryView";
import StatusBadge from "@/components/enterprise/StatusBadge";
import Toast from "@/components/Toast";
import { ApiError, apiFetchJson } from "@/lib/apiClient";
import PackageSalarySetup from "./PackageSalarySetup";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { currentPayrollMonth, getMonthDaysFromDateString } from "@/lib/salary/monthDays";
import ModernPayslipView from "./ModernPayslipView";
import { OFFER_BREAKUP } from "@/lib/salary/agreed";
import type { AgreedSalaryBreakup } from "@/lib/salary/types";

type EmployeeOption = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  joining_date?: string | null;
  work_location?: string;
};
type SalaryComponent = { key: string; name: string; type: "earning" | "deduction"; annual: number; monthly: number; amountForMonth?: number; sortOrder: number; };
type SalaryCalculation = {
  earningsAnnual: SalaryComponent[];
  deductionsAnnual: SalaryComponent[];
  summary: {
    ctcAnnual: number;
    grossAnnualTaxableSalary: number;
    totalEarningsAnnual: number;
    totalDeductionsAnnual: number;
  };
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
};

type PayslipRow = {
  id: number;
  month: number;
  year: number;
  paid_days: number;
  gross_monthly: number;
  total_deductions: number;
  net_salary: number;
  generated_at: string;
};

function inr(n: number) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayMonthDate() {
  return `${currentPayrollMonth()}-01`;
}

export default function Employee360SalaryTab({ employeeId, employee, canManage = false }: { employeeId: number; employee?: EmployeeOption; canManage?: boolean }) {
  const { mutate: refresh } = useSWRConfig();
  const [toast, setToast] = React.useState<{ message: string; variant?: "success" | "error" | "blocked" | "info" } | null>(null);
  const [calculation, setCalculation] = React.useState<SalaryCalculation | null>(null);
  const [setupPreview, setSetupPreview] = React.useState<SalaryCalculation | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [viewingPayslip, setViewingPayslip] = React.useState<number | null>(null);
  const [agreedBreakup, setAgreedBreakup] = React.useState<AgreedSalaryBreakup | null>(null);
  const [setupDirty, setSetupDirty] = React.useState(false);
  const [reviewPackage, setReviewPackage] = React.useState(false);
  const [replaceReviewed, setReplaceReviewed] = React.useState(false);
  const [actualNetPaid, setActualNetPaid] = React.useState("");
  const setupRef = React.useRef<HTMLDetailsElement>(null);
  const generatorRef = React.useRef<HTMLElement>(null);

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

  const payslipsSwr = useSWR<{ payslips: PayslipRow[] }>(
    employeeId > 0 ? `/api/payslips/${employeeId}` : null,
    dashboardFetcher,
    { revalidateOnFocus: false }
  );
  const monthStructureSwr = useSWR<{ structure: any }>(
    employeeId > 0 && salaryMonth ? `/api/salary-structures/${employeeId}?month=${salaryMonth.slice(0, 7)}` : null,
    dashboardFetcher,
    { revalidateOnFocus: false }
  );
  const monthStructure = monthStructureSwr.data?.structure;
  const missingSetup = monthStructureSwr.error instanceof ApiError && monthStructureSwr.error.status === 404;

  const selectedEmployee = employee;

  function reviewSuppliedOffer() {
    setReplaceReviewed(true);
    setAgreedBreakup({ ...OFFER_BREAKUP }); setCtcAnnual("1800000"); setCalculation(null); setSetupPreview(null); setSetupDirty(true);
    if (setupRef.current) setupRef.current.open = true;
    window.requestAnimationFrame(() => setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  React.useEffect(() => {
    if (!selectedEmployee || employeeId <= 0) return;
    setEmployeeCode(String(selectedEmployee.employee_code || ""));
    setDepartment(String(selectedEmployee.department || ""));
    setDesignation(String(selectedEmployee.designation || ""));
    setDateOfJoining(String(selectedEmployee.joining_date || ""));
    setWorkLocation(String(selectedEmployee.work_location || ""));
  }, [employeeId, selectedEmployee]);

  React.useEffect(() => {
    if ((!monthStructure && !missingSetup) || employeeId <= 0) return;
    const structure = monthStructure ?? {};
    setPan(String(structure.pan || ""));
    setUanNumber(String(structure.uan_number || ""));
    setPfNumber(String(structure.pf_number || ""));
    setBankAccountNumber(String(structure.bank_account_number || ""));
    setCtcAnnual(structure.ctc_annual == null ? "" : String(Number(structure.ctc_annual)));
    setAgreedBreakup(structure.agreed_breakup || null);
    setSetupDirty(false);
    setActualNetPaid("");
    setTaxRegime((String(structure.tax_regime || "new_regime") as "new_regime" | "old_regime" | "manual_tds"));
    setManualTdsAnnual(structure.manual_tds_annual == null ? "" : String(Number(structure.manual_tds_annual)));
    setProfessionalTaxMonthly(String(Number(structure.professional_tax_monthly ?? 200)));
    setPfEnabled(Boolean(structure.pf_enabled));
    setEmployerPfIncludedInCtc(Boolean(structure.employer_pf_included_in_ctc));
    setEmployeePfEnabled(Boolean(structure.employee_pf_enabled));
    setHealthInsuranceEnabled(Boolean(structure.health_insurance_enabled));
    setHealthInsuranceAnnual(String(Number(structure.health_insurance_annual || 0)));
  }, [employeeId, missingSetup, monthStructure]);

  async function refreshSavedSetup() {
    await refresh(key => typeof key === "string" && key.startsWith(`/api/salary-structures/${employeeId}?month=`));
    await refresh(`/api/hrms/employees/${employeeId}/setup`);
    setSetupDirty(false);
    setActualNetPaid("");
  }

  function selectMonth(month: string) {
    const value = month ? `${month}-01` : "";
    const days = String(getMonthDaysFromDateString(value));
    setSalaryMonth(value); setDefinedWorkDays(days); setTotalPaidDays(days); setLopDays("0");
    setActualNetPaid(""); setCalculation(null); setSetupPreview(null); setReplaceReviewed(false);
  }

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
      agreedBreakup,
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
      agreedBreakup,
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
      setSetupPreview(data.calculation);
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
      await apiFetchJson("/api/salary-structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSetupPreview(null);
      setToast({ message: "Salary structure saved.", variant: "success" });
      await refreshSavedSetup();
      if (setupRef.current) setupRef.current.open = false;
      window.requestAnimationFrame(() => generatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save salary structure", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function generatePayslip(preview = false) {
    if (employeeId <= 0) return setToast({ message: "Please select employee", variant: "blocked" });
    if (setupDirty) return setToast({ message: "Save the salary setup changes first.", variant: "blocked" });
    setBusy(true);
    try {
      const [year, month] = salaryMonth.split("-").map(Number);
      const response = await apiFetchJson<{ payslipId?: number; calculation?: SalaryCalculation; operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string }>("/api/payslips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          month,
          year,
          definedWorkDays: Number(definedWorkDays),
          paidDays: Number(totalPaidDays || 0),
          lopDays: Number(lopDays || 0),
          preview,
          ...(actualNetPaid.trim() !== "" ? { actualNetPaid: Number(actualNetPaid) } : {}),
        }),
      });
      if (preview && response.calculation) { setCalculation(response.calculation); return; }
      setToast({
        message: response.user_message || "Payslip generated successfully.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await payslipsSwr.mutate();
      if (response.payslipId) setViewingPayslip(response.payslipId);
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
    <div className="space-y-6 animate-in fade-in">
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant || "info"}
          onClose={() => setToast(null)}
        />
      )}

      <section ref={generatorRef} className={UI.card + " scroll-mt-40 p-4 sm:p-5"}>
        <h2 className="text-base font-semibold">Generate payslip</h2>
        <p className="mt-1 text-sm text-[var(--ats-text-muted)]">Choose the month the employee earned the salary. Payslips use the setup saved for that period.</p>
        {missingSetup ? <p className="mt-3 text-sm"><strong>Not saved.</strong> Save a salary setup for this month before previewing or generating a payslip.</p>
          : monthStructureSwr.error ? <p role="alert" className="mt-3 text-sm">Unable to load this month&apos;s salary setup. <button type="button" className="underline" onClick={() => void monthStructureSwr.mutate()}>Try again</button>.</p>
          : salaryMonth && !monthStructure ? <p className="mt-3 text-sm">Loading salary setup for the selected month…</p> : null}
        {monthStructure && <section aria-label="Saved salary calculation" className="mt-3 rounded-lg border border-[var(--ats-border)] p-3 text-sm">
          <p className="font-semibold">Saved calculation: {monthStructure.package_review ? "Reviewed package" : monthStructure.agreed_breakup ? "Agreed offer breakup" : "Automatic calculation"}</p>
          <p className="mt-1 text-xs text-[var(--ats-text-muted)]">Effective month {String(monthStructure.effective_from ?? monthStructure.salary_month ?? "").slice(0, 7) || "unavailable"}.</p>
          {!monthStructure.package_review && !monthStructure.agreed_breakup && Number(monthStructure.ctc_annual) === 1800000 && <>
            <p className="mt-2">The supplied ₹18 lakh offer is not saved for this salary month. That offer gives full-month earnings of ₹1,50,000, deductions of ₹15,817 and net pay of ₹1,34,183.</p>
            {canManage && <button type="button" className={UI.secondaryButton + " mt-3"} disabled={busy} onClick={reviewSuppliedOffer}>Review supplied ₹18 lakh offer</button>}
            <p className="mt-2 text-xs text-[var(--ats-text-muted)]">Review the breakup and select Save Structure once to use it for future payslips. Existing PDFs remain unchanged.</p>
          </>}
        </section>}
        {canManage && <button type="button" className={UI.secondaryButton + " mt-3"} disabled={busy || reviewPackage} onClick={() => setReviewPackage(true)}>
          {monthStructure?.package_review ? "Edit reviewed package" : "Review annual package"}
        </button>}
        {setupDirty && <p className="mt-2 text-sm text-amber-700">Save your salary setup changes before generating.</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className={UI.label}>Salary month
            <input type="month" className={UI.input} disabled={busy || reviewPackage} value={salaryMonth.slice(0, 7)} onChange={e => selectMonth(e.target.value)} />
          </label>
          <label className={UI.label}>Eligible days before absence
            <input type="number" className={UI.input} disabled={busy} min={0} max={Number(definedWorkDays)} value={totalPaidDays} onChange={e => { setTotalPaidDays(e.target.value); setCalculation(null); }} />
          </label>
          <label className={UI.label}>Absent / unpaid days
            <input type="number" className={UI.input} disabled={busy} min={0} max={Number(totalPaidDays)} value={lopDays} onChange={e => { setLopDays(e.target.value); setCalculation(null); }} />
          </label>
        </div>
        {monthStructure?.agreed_breakup && <div className="mt-4 max-w-sm">
          <label className={UI.label}>Amount already paid (optional)
            <input className={UI.input} disabled={busy} type="number" min={0} step="0.01" value={actualNetPaid} placeholder="Leave blank for calculated pay" onChange={e => { setActualNetPaid(e.target.value); setCalculation(null); }} />
          </label>
          <p className="mt-1 text-xs text-[var(--ats-text-muted)]">For past payments. Any difference is shown as a payment adjustment.</p>
        </div>}
        <p className="mt-3 text-sm text-[var(--ats-text-muted)]">{Math.max(0, Number(totalPaidDays) - Number(lopDays))} payable days out of {definedWorkDays}. {monthStructure?.package_review ? "Reviewed cash earnings and deductions are prorated together." : monthStructure?.agreed_breakup ? "Agreed earnings and deductions are prorated once. Net pay is rounded down to whole rupees." : "Uses the automatic calculation when that setup is saved."}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={UI.secondaryButton} disabled={busy || reviewPackage || setupDirty || !salaryMonth || !canManage || !monthStructure || !!monthStructureSwr.error} onClick={() => void generatePayslip(true)}>Preview payslip</button>
          <button type="button" className={UI.primaryButton} disabled={busy || reviewPackage || setupDirty || !salaryMonth || !canManage || !monthStructure || !!monthStructureSwr.error} onClick={() => void generatePayslip()}>Generate payslip</button>
        </div>
        {calculation && <div className="mt-4 flex flex-wrap gap-6 text-sm"><span>Earnings: ₹{inr(calculation.grossMonthlySalary)}</span><span>Deductions: ₹{inr(calculation.totalMonthlyDeductions)}</span><strong>Net pay: ₹{inr(calculation.netMonthlySalary)}</strong></div>}
        {calculation && [...calculation.earningsAnnual, ...calculation.deductionsAnnual].filter(row => row.key === "payment_adjustment").map(row => <p key={row.key} className="mt-2 text-sm">{row.name}: {row.type === "earning" ? "+" : "−"}₹{inr(row.amountForMonth || 0)}</p>)}
      </section>

      {reviewPackage && <PackageSalarySetup employeeId={employeeId} initialMonth={salaryMonth.slice(0, 7)} onCancel={() => setReviewPackage(false)}
        onSaved={async month => {
          selectMonth(month);
          await refreshSavedSetup();
          setReviewPackage(false);
          setToast({ message: "Reviewed package saved. Preview the payslip for this month.", variant: "success" });
          generatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }} />}
      {/* Generated Payslips */}
      <section className={UI.card + " p-4 sm:p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Generated Payslips</h2>
            <div className="text-sm text-[var(--ats-text-muted)]">Payslips generated for this employee.</div>
          </div>
          <div className="text-sm text-[var(--ats-text-muted)]">{payslipsSwr.data?.payslips?.length || 0} payslip(s)</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ats-text-muted)]">
                <th className="px-2 py-2">Month</th>
                <th className="px-2 py-2">Paid days</th>
                <th className="px-2 py-2">Gross</th>
                <th className="px-2 py-2">Net</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(!payslipsSwr.data?.payslips || payslipsSwr.data.payslips.length === 0) ? (
                <tr>
                  <td className="px-2 py-4 text-[var(--ats-text-muted)]" colSpan={5}>
                    No payslips generated yet.
                  </td>
                </tr>
              ) : (
                payslipsSwr.data.payslips.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">
                      {new Date(Date.UTC(row.year, row.month - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                    </td>
                    <td className="px-2 py-2">{row.paid_days}</td>
                    <td className="px-2 py-2">₹{inr(row.gross_monthly)}</td>
                    <td className="px-2 py-2 font-medium text-[var(--ats-text)]">₹{inr(row.net_salary)}</td>
                    <td className="px-2 py-2 flex items-center gap-3">
                      <button
                        onClick={() => setViewingPayslip(row.id)}
                        className="text-[var(--ats-accent)] hover:underline"
                      >
                        View
                      </button>
                      <a className="text-[var(--ats-text-muted)] hover:text-[var(--ats-text)] transition" href={`/api/payslips/${row.id}/download`}>
                        PDF
                      </a>
                      {canManage && <button
                        className="text-rose-400 hover:underline"
                        onClick={() => void deletePayslip(row.id)}
                      >
                        Delete
                      </button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payslip Modal */}
      {viewingPayslip && (
        <PayslipModal payslipId={viewingPayslip} onClose={() => setViewingPayslip(null)} />
      )}

      {/* Salary Configuration Form */}
      <details ref={setupRef} className={UI.card + " scroll-mt-40 p-4 sm:p-5"} onChangeCapture={() => { setSetupDirty(true); setCalculation(null); setSetupPreview(null); }}>
        <summary className="cursor-pointer font-semibold">Salary setup and employee details</summary>
        {monthStructure?.package_review && !replaceReviewed && <div className="mt-3 text-sm">
          <p>This month uses a reviewed package. Edit it above or choose a different calculation here.</p>
          {canManage && <button type="button" className={UI.secondaryButton + " mt-2"} onClick={() => setReplaceReviewed(true)}>Change calculation type</button>}
        </div>}
        <fieldset disabled={!canManage || busy || reviewPackage || (!monthStructure && !missingSetup) || (Boolean(monthStructure?.package_review) && !replaceReviewed)}>
        <p className="mt-3 text-sm text-[var(--ats-text-muted)]">Personal and employment details come from the Details section. Set salary amounts and payroll identity details here.</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ats-border)] pb-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Saved salary setup</h2>
            <div className="text-sm text-[var(--ats-text-muted)]">Set up once, then generate monthly payslips above.</div>
          </div>
        </div>
        
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={UI.secondaryButton} onClick={reviewSuppliedOffer}>Use supplied ₹18 lakh offer breakup</button>
          {agreedBreakup && <button type="button" className={UI.secondaryButton} onClick={() => { setAgreedBreakup(null); setCalculation(null); setSetupPreview(null); setSetupDirty(true); }}>Use automatic calculation</button>}
        </div>
        {agreedBreakup && <div className="mt-4">
          <p className="text-sm text-[var(--ats-text-muted)]">Agreed annual amounts. Monthly values are rounded to whole rupees; no tax-rate recalculation.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(Object.keys(OFFER_BREAKUP) as Array<keyof AgreedSalaryBreakup>).map(key => <label key={key} className={UI.label}>
              {({ basic: "Basic salary", hra: "HRA", special: "Special allowance", conveyance: "Conveyance allowance", employerPf: "Employer PF (income)", other: "Other allowance", professionalTax: "Professional tax", employerPfDeduction: "Employer PF (deduction)", employeePf: "Employee PF", tds: "TDS" })[key]} (annual)
              <input className={UI.input} type="number" min={0} value={agreedBreakup[key]} onChange={e => { setAgreedBreakup({ ...agreedBreakup, [key]: Number(e.target.value) }); setCalculation(null); }} />
            </label>)}
          </div>
        </div>}
        <div className="grid gap-6 sm:grid-cols-2 mt-4">
          <div>
            <label className={UI.label}>CTC (Annual) *</label>
            <input
              type="number"
              min="0"
              className={UI.input}
              value={ctcAnnual}
              onChange={(e) => setCtcAnnual(e.target.value)}
              placeholder="e.g. 1600000"
            />
          </div>
          <label className={UI.label}>Effective salary month
            <input className={UI.input} type="month" value={salaryMonth.slice(0, 7)} onChange={event => selectMonth(event.target.value)} />
          </label>
          <div>
            <label className={UI.label}>Defined Work Days</label>
            <input
              type="number"
              min="1"
              className={UI.input}
              value={definedWorkDays}
              onChange={(e) => setDefinedWorkDays(e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--ats-text-muted)]">Max working days in the month (e.g. 30, 31, 28).</p>
          </div>
          <label className={UI.label}>PAN<input className={UI.input} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} /></label>
          <label className={UI.label}>UAN Number<input className={UI.input} value={uanNumber} onChange={(e) => setUanNumber(e.target.value)} /></label>
          <label className={UI.label}>PF Number<input className={UI.input} value={pfNumber} onChange={(e) => setPfNumber(e.target.value)} /></label>
          <label className={UI.label}>Bank Account Number<input className={UI.input} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} /></label>
          <label className={UI.label}>Total Paid Days<input className={UI.input} type="number" min={0} value={totalPaidDays} onChange={(e) => setTotalPaidDays(e.target.value)} /></label>
          <label className={UI.label}>LOP Days<input className={UI.input} type="number" min={0} value={lopDays} onChange={(e) => setLopDays(e.target.value)} /></label>
          {!agreedBreakup && <><label className={UI.label}>
            Tax Regime
            <select className={UI.select} value={taxRegime} onChange={(e) => setTaxRegime(e.target.value as any)}>
              <option value="new_regime">New Regime</option>
              <option value="old_regime">Old Regime</option>
              <option value="manual_tds">Manual TDS</option>
            </select>
          </label>
          <label className={UI.label}>Manual TDS Annual<input className={UI.input} type="number" min={0} value={manualTdsAnnual} onChange={(e) => setManualTdsAnnual(e.target.value)} /></label>
          <label className={UI.label}>Professional Tax Monthly<input className={UI.input} type="number" min={0} value={professionalTaxMonthly} onChange={(e) => setProfessionalTaxMonthly(e.target.value)} /></label>
          <label className={UI.label}>Health Insurance Annual<input className={UI.input} type="number" min={0} value={healthInsuranceAnnual} onChange={(e) => setHealthInsuranceAnnual(e.target.value)} /></label></>}
        </div>

        {!agreedBreakup && <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={pfEnabled} onChange={(e) => setPfEnabled(e.target.checked)} /> PF enabled</label>
          <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={employerPfIncludedInCtc} onChange={(e) => setEmployerPfIncludedInCtc(e.target.checked)} /> Employer PF included in CTC</label>
          <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={employeePfEnabled} onChange={(e) => setEmployeePfEnabled(e.target.checked)} /> Employee PF enabled</label>
          <label className={UI.label + " flex items-center gap-2"}><input type="checkbox" checked={healthInsuranceEnabled} onChange={(e) => setHealthInsuranceEnabled(e.target.checked)} /> Health insurance enabled</label>
        </div>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className={UI.secondaryButton + " py-2 px-6"} onClick={() => void calculatePreview()} disabled={busy}>Preview Salary</button>
          <button type="button" className={UI.primaryButton + " py-2 px-6"} onClick={() => void saveStructure()} disabled={busy}>Save Structure</button>
        </div>

        {setupPreview && (
          <div className="mt-8 pt-6 border-t border-[var(--ats-border)] animate-in fade-in">
            <h3 className="text-lg font-bold text-[var(--ats-text)] mb-6">Payslip Preview</h3>
            <ModernPayslipView 
              data={{
                companyName: "AASTHIX TALENT",
                monthLabel: new Date(salaryMonth).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
                employeeName: String(selectedEmployee?.full_name || ""),
                employeeCode,
                department,
                designation,
                dateOfJoining,
                pan,
                uanNumber,
                pfNumber,
                bankAccountNumber,
                workLocation,
                paidDays: Number(totalPaidDays),
                lopDays: Number(lopDays),
                calculation: setupPreview,
              }}
            />
          </div>
        )}
        </fieldset>
      </details>
    </div>
  );
}

function PayslipModal({ payslipId, onClose }: { payslipId: number; onClose: () => void }) {
  const { data, error } = useSWR<any>(`/api/payslips/${payslipId}/data`, dashboardFetcher);
  
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl w-full max-w-sm">
          <p className="text-rose-400 font-bold mb-2">Error</p>
          <p className="text-slate-300 text-sm mb-4">Failed to load payslip data.</p>
          <button onClick={onClose} className={UI.secondaryButton}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto pt-24 pb-12">
      <div className="w-full max-w-4xl relative mt-auto mb-auto">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-slate-400 hover:text-white bg-slate-900 border border-slate-700 px-4 py-2 rounded-full text-sm font-bold shadow-lg transition"
        >
          ✕ Close
        </button>
        {!data ? (
          <div className="bg-slate-900 border border-[var(--ats-border)] rounded-2xl h-[400px] flex items-center justify-center text-slate-400 shadow-2xl">
            Loading...
          </div>
        ) : (
          <ModernPayslipView data={data.data} onDownload={() => window.location.href = `/api/payslips/${payslipId}/download`} />
        )}
      </div>
    </div>
  );
}
