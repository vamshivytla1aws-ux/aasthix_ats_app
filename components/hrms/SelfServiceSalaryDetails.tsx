"use client";

import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import type { EmployeeSalaryOverview } from "@/lib/salary/overview";
import { currentPayrollMonth } from "@/lib/salary/monthDays";
import { ApiError } from "@/lib/apiClient";

const rupees = (amount: number) => `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default function SelfServiceSalaryDetails({ employeeId }: { employeeId?: number }) {
  const { data, error } = useSWR<EmployeeSalaryOverview>(employeeId ? `/api/salary-structures/${employeeId}?month=${currentPayrollMonth()}` : null, dashboardFetcher);
  const salary = data?.structure;
  return <section className={UI.card + " p-5"}>
    <h2 className="font-semibold">My salary breakup</h2>
    <p className="mt-1 text-sm text-[var(--ats-text-muted)]">Your saved full-month setup. See issued payslips for actual monthly pay.</p>
    {error ? <p className="mt-3 text-sm">{error instanceof ApiError && error.status === 404 ? "No salary setup applies to the current month." : "Unable to load salary details. Please try again."}</p>
      : !salary ? <p className="mt-3 text-sm">Loading salary details…</p> : <>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[["Calculation", salary.mode], ["Effective month", salary.effective_from.slice(0, 7)], ["Annual CTC", rupees(salary.ctc_annual)],
            ...(salary.employer_pf == null ? [] : [["Employer PF per month", rupees(salary.employer_pf)]]),
            ["Bank account", salary.bank_account_number], ["PAN", salary.pan], ["UAN", salary.uan_number], ["PF number", salary.pf_number]].map(([label, value]) =>
            <div key={label}><p className="text-xs text-[var(--ats-text-muted)]">{label}</p><p className="mt-1 text-sm font-medium">{value || "Not added"}</p></div>)}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(["earning", "deduction"] as const).map(type => <section key={type} className={UI.sectionCard + " p-3"}>
            <h3 className="text-sm font-semibold">{type === "earning" ? "Monthly earnings" : "Monthly deductions"}</h3>
            <dl className="mt-2 space-y-1 text-sm">{data.components.filter(row => row.type === type).map(row => <div key={row.key} className="flex justify-between gap-3">
              <dt>{row.name}</dt><dd>{rupees(row.monthly)}</dd>
            </div>)}</dl>
          </section>)}
        </div>
      </>}
  </section>;
}
