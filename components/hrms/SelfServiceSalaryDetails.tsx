"use client";

import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type SalaryDetails = { ctc_annual: number; pan: string; bank_account_number: string; pf_number: string; uan_number: string };
export default function SelfServiceSalaryDetails({ employeeId }: { employeeId?: number }) {
  const { data, error } = useSWR<{ structure: SalaryDetails }>(employeeId ? `/api/salary-structures/${employeeId}` : null, dashboardFetcher);
  const salary = data?.structure;
  return <section className={UI.card + " p-5"}>
    <h2 className="font-semibold">My Salary Details</h2>
    {!salary ? <p className="mt-3 text-sm text-[var(--ats-text-muted)]">{error || data ? "Salary details are not available. Contact HR if your setup is missing." : "Loading salary details…"}</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[["Annual CTC", `₹${Number(salary.ctc_annual).toLocaleString("en-IN")}`], ["Bank account", salary.bank_account_number], ["PAN", salary.pan], ["UAN", salary.uan_number], ["PF number", salary.pf_number]].map(([label, value]) => <div key={label}><p className="text-xs text-[var(--ats-text-muted)]">{label}</p><p className="mt-1 text-sm font-medium">{value || "Not added"}</p></div>)}
    </div>}
  </section>;
}
