import React from "react";
import { UI } from "@/lib/ui";
import type { SalaryCalcResult, PayslipTaxSheetSnapshot } from "@/lib/salary/types";

type PayslipData = {
  companyName: string;
  monthLabel: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  pan: string;
  uanNumber: string;
  pfNumber: string;
  bankAccountNumber: string;
  workLocation: string;
  paidDays: number;
  lopDays: number;
  calculation: SalaryCalcResult;
};

function inr(n: number) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ModernPayslipView({ data, onDownload }: { data: PayslipData; onDownload?: () => void }) {
  const { calculation } = data;
  return (
    <div className="w-full rounded-2xl border border-[var(--ats-border)] bg-slate-900 overflow-hidden shadow-2xl font-sans text-slate-300">
      {/* Header */}
      <div className="bg-slate-950 p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[var(--ats-border)] gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">{data.companyName}</h1>
          <p className="text-slate-400 text-sm">Payslip for the month of <strong className="text-white">{data.monthLabel}</strong></p>
        </div>
        <div className="flex gap-3">
          {onDownload && (
            <button onClick={onDownload} className={UI.secondaryButton}>
              Download PDF
            </button>
          )}
        </div>
      </div>

      {/* Employee Details */}
      <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 text-sm border-b border-[var(--ats-border)]">
        <div>
          <p className="text-slate-500 mb-1">Employee Name</p>
          <p className="font-semibold text-slate-200">{data.employeeName}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">Employee Code</p>
          <p className="font-semibold text-slate-200">{data.employeeCode}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">Designation</p>
          <p className="font-semibold text-slate-200">{data.designation}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">Department</p>
          <p className="font-semibold text-slate-200">{data.department || "-"}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">Date of Joining</p>
          <p className="font-semibold text-slate-200">{data.dateOfJoining || "-"}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">PAN Number</p>
          <p className="font-semibold text-slate-200">{data.pan || "-"}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">PF Number / UAN</p>
          <p className="font-semibold text-slate-200">{data.pfNumber || "-"} / {data.uanNumber || "-"}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-1">Bank Account</p>
          <p className="font-semibold text-slate-200">{data.bankAccountNumber || "-"}</p>
        </div>
      </div>

      {/* Days Summary */}
      <div className="px-6 sm:px-8 py-4 bg-slate-950/30 flex gap-12 border-b border-[var(--ats-border)] text-sm">
        <div>
          <span className="text-slate-500 mr-2">Paid Days:</span>
          <span className="font-bold text-white">{data.paidDays}</span>
        </div>
        <div>
          <span className="text-slate-500 mr-2">LOP Days:</span>
          <span className="font-bold text-white">{data.lopDays}</span>
        </div>
      </div>

      {/* Salary Components */}
      <div className="p-6 sm:p-8 grid lg:grid-cols-2 gap-8">
        {/* Earnings */}
        <div>
          <h2 className="text-lg font-bold text-emerald-400 mb-4 border-b border-emerald-900/50 pb-2">Earnings</h2>
          <div className="space-y-3">
            {calculation.earningsAnnual.map((item) => (
              <div key={item.key} className="flex justify-between items-center text-sm">
                <span className="text-slate-300">{item.name}</span>
                <span className="font-medium text-slate-200">₹{inr(item.amountForMonth ?? item.monthly)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--ats-border)] flex justify-between items-center font-bold">
            <span className="text-slate-400">Total Earnings</span>
            <span className="text-emerald-400 text-base">₹{inr(calculation.grossMonthlySalary)}</span>
          </div>
        </div>

        {/* Deductions */}
        <div>
          <h2 className="text-lg font-bold text-rose-400 mb-4 border-b border-rose-900/50 pb-2">Deductions</h2>
          <div className="space-y-3">
            {calculation.deductionsAnnual.map((item) => (
              <div key={item.key} className="flex justify-between items-center text-sm">
                <span className="text-slate-300">{item.name}</span>
                <span className="font-medium text-slate-200">₹{inr(item.amountForMonth ?? item.monthly)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--ats-border)] flex justify-between items-center font-bold">
            <span className="text-slate-400">Total Deductions</span>
            <span className="text-rose-400 text-base">₹{inr(calculation.totalMonthlyDeductions)}</span>
          </div>
        </div>
      </div>

      {/* Net Pay Highlight */}
      <div className="bg-slate-950 p-6 sm:p-8 border-t border-[var(--ats-border)] flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm mb-1 uppercase tracking-widest">Net Payable</p>
          <p className="text-3xl font-black text-cyan-400 tracking-tight">₹{inr(calculation.netMonthlySalary)}</p>
          <p className="text-sm text-slate-400 mt-2">({calculation.netSalaryInWords})</p>
        </div>
        <div className="text-right text-xs text-slate-600 max-w-sm">
          <p>This is a system generated payslip and does not require a signature.</p>
        </div>
      </div>
    </div>
  );
}
