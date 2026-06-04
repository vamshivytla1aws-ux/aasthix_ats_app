"use client";

import React from "react";
import useSWR from "swr";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import StatusBadge from "@/components/enterprise/StatusBadge";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type AuthPayload = {
  user?: { id?: number; full_name?: string };
};

type PayslipRow = {
  id: number;
  month: number;
  year: number;
  paid_days: number;
  lop_days: number;
  gross_monthly: number;
  total_deductions: number;
  net_salary: number;
  generated_at: string;
};

type AnnualStatement = {
  employee_name: string;
  employee_code: string;
  department: string;
  designation: string;
  label: string;
  months: PayslipRow[];
  totals: {
    gross: number;
    deductions: number;
    net: number;
  };
};

type AnnualResponse = {
  financial_years: Array<{ start_year: number; label: string }>;
  statement: AnnualStatement | null;
};

function inr(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthLabel(month: number, year: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export default function SelfServiceSalaryView() {
  const [startYear, setStartYear] = React.useState<number | null>(null);
  const { data: me } = useSWR<AuthPayload>("/api/auth/me", dashboardFetcher, { revalidateOnFocus: false });
  const employeeId = me?.user?.id;

  const { data: payslipData } = useSWR<{ payslips: PayslipRow[] }>(
    employeeId ? `/api/payslips/${employeeId}` : null,
    dashboardFetcher,
    { revalidateOnFocus: false },
  );
  const annualUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    if (startYear) params.set("start_year", String(startYear));
    return `/api/payslips/annual${params.toString() ? `?${params.toString()}` : ""}`;
  }, [startYear]);
  const { data: annualData } = useSWR<AnnualResponse>(employeeId ? annualUrl : null, dashboardFetcher, {
    revalidateOnFocus: false,
  });

  React.useEffect(() => {
    if (startYear || !annualData?.financial_years?.length) return;
    setStartYear(annualData.financial_years[0].start_year);
  }, [annualData?.financial_years, startYear]);

  const payslips = payslipData?.payslips || [];
  const statement = annualData?.statement;

  return (
    <ModulePageFrame
      title="My Pay"
      subtitle="View your monthly payslips and yearly salary statement."
      metrics={<StatusBadge status="Self Service" />}
    >
      <section className={UI.card + " p-4 sm:p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Monthly payslips</h2>
            <div className="text-sm text-[var(--ats-text-muted)]">Download monthly payslips generated for your employee record.</div>
          </div>
          <div className="text-sm text-[var(--ats-text-muted)]">{payslips.length} payslip(s)</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ats-text-muted)]">
                <th className="px-2 py-2">Month</th>
                <th className="px-2 py-2">Paid days</th>
                <th className="px-2 py-2">Gross</th>
                <th className="px-2 py-2">Deductions</th>
                <th className="px-2 py-2">Net</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {payslips.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-[var(--ats-text-muted)]" colSpan={6}>
                    No payslips generated yet.
                  </td>
                </tr>
              ) : (
                payslips.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{monthLabel(row.month, row.year)}</td>
                    <td className="px-2 py-2">{row.paid_days}</td>
                    <td className="px-2 py-2">₹{inr(row.gross_monthly)}</td>
                    <td className="px-2 py-2">₹{inr(row.total_deductions)}</td>
                    <td className="px-2 py-2 font-medium text-[var(--ats-text)]">₹{inr(row.net_salary)}</td>
                    <td className="px-2 py-2">
                      <a className="text-[var(--ats-accent)] hover:underline" href={`/api/payslips/${row.id}/download`}>
                        Download
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={UI.card + " mt-4 p-4 sm:p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Yearly salary statement</h2>
            <div className="text-sm text-[var(--ats-text-muted)]">Financial-year view aggregated from your monthly payslips.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className={UI.label + " mb-0"}>
              Financial year
              <select
                className={UI.select + " min-w-[180px]"}
                value={startYear ? String(startYear) : ""}
                onChange={(e) => setStartYear(Number(e.target.value || 0))}
              >
                {(annualData?.financial_years || []).map((row) => (
                  <option key={row.start_year} value={row.start_year}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!statement ? (
          <div className="mt-4 text-sm text-[var(--ats-text-muted)]">No yearly salary statement is available yet.</div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-[var(--ats-border)] p-3">
                <div className="text-xs text-[var(--ats-text-muted)]">Employee</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{statement.employee_name}</div>
                <div className="text-xs text-[var(--ats-text-muted)]">{statement.employee_code || "—"}</div>
              </div>
              <div className="rounded-lg border border-[var(--ats-border)] p-3">
                <div className="text-xs text-[var(--ats-text-muted)]">Financial year</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">{statement.label}</div>
                <div className="text-xs text-[var(--ats-text-muted)]">{statement.designation || statement.department || "—"}</div>
              </div>
              <div className="rounded-lg border border-[var(--ats-border)] p-3">
                <div className="text-xs text-[var(--ats-text-muted)]">Total gross</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">₹{inr(statement.totals.gross)}</div>
              </div>
              <div className="rounded-lg border border-[var(--ats-border)] p-3">
                <div className="text-xs text-[var(--ats-text-muted)]">Total net</div>
                <div className="text-sm font-semibold text-[var(--ats-text)]">₹{inr(statement.totals.net)}</div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ats-text-muted)]">
                    <th className="px-2 py-2">Month</th>
                    <th className="px-2 py-2">Paid days</th>
                    <th className="px-2 py-2">Gross</th>
                    <th className="px-2 py-2">Deductions</th>
                    <th className="px-2 py-2">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.months.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--ats-border)]">
                      <td className="px-2 py-2">{monthLabel(row.month, row.year)}</td>
                      <td className="px-2 py-2">{row.paid_days}</td>
                      <td className="px-2 py-2">₹{inr(row.gross_monthly)}</td>
                      <td className="px-2 py-2">₹{inr(row.total_deductions)}</td>
                      <td className="px-2 py-2 font-medium text-[var(--ats-text)]">₹{inr(row.net_salary)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--ats-border-strong)] font-semibold text-[var(--ats-text)]">
                    <td className="px-2 py-2">Total</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">₹{inr(statement.totals.gross)}</td>
                    <td className="px-2 py-2">₹{inr(statement.totals.deductions)}</td>
                    <td className="px-2 py-2">₹{inr(statement.totals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </ModulePageFrame>
  );
}
