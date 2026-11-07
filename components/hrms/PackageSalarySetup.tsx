"use client";

import React from "react";
import useSWR from "swr";
import { ApiError, apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import type { estimatePackage } from "@/lib/salary/packageReview";
import type { PackageReview } from "@/lib/salary/types";

type Estimate = { estimate: ReturnType<typeof estimatePackage>; financialYear: string; suggestedTds: number | null };
const deductions = { employerPf: "Employer PF", employeePf: "Employee PF", professionalTax: "Professional tax", tds: "TDS" } as const;
const identifiers = { pan: ["PAN", "pan"], uanNumber: ["UAN", "uan_number"], pfNumber: ["PF number", "pf_number"], bankAccountNumber: ["Bank account", "bank_account_number"] } as const;
type Draft = Partial<Record<keyof typeof deductions | keyof typeof identifiers | "ctc" | "included", string>> & { regime?: PackageReview["regime"] };
const rupees = (value: number | null) => value == null ? "Pending" : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PackageSalarySetup({ employeeId, initialMonth, onSaved, onCancel }: {
  employeeId: number; initialMonth: string; onSaved: (month: string) => Promise<void>; onCancel: () => void;
}) {
  const [month, setMonth] = React.useState(initialMonth);
  const [changes, setChanges] = React.useState<Draft>({});
  const [result, setResult] = React.useState<Estimate | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const panel = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  const saved = useSWR<{ structure: Record<string, unknown> }>(
    month ? `/api/salary-structures/${employeeId}?month=${month}` : null, dashboardFetcher, { revalidateOnFocus: false });
  const prior = saved.data?.structure;
  const review = prior?.package_review as PackageReview | undefined;
  const loadError = saved.error && (!(saved.error instanceof ApiError) || saved.error.status !== 404);
  const draft: Draft = {
    ctc: prior?.ctc_annual == null ? "" : String(prior.ctc_annual),
    included: review ? String(review.employerPfInCtc) : "",
    regime: review?.regime ?? "new_regime",
    ...Object.fromEntries(Object.keys(deductions).map(key => [key, review ? String(review[key as keyof typeof deductions]) : ""])),
    ...Object.fromEntries(Object.entries(identifiers).map(([key, [, field]]) => [key, String(prior?.[field] ?? "")])),
    ...changes,
  };
  const payload = {
    employeeId, ctcAnnual: Number(draft.ctc), taxRegime: draft.regime,
    packageReview: {
      employerPfInCtc: draft.included ? draft.included === "true" : undefined,
      ...Object.fromEntries(Object.keys(deductions).map(key => [key, draft[key as keyof typeof deductions]?.trim() ? Number(draft[key as keyof typeof deductions]) : undefined])),
      regime: draft.regime,
    },
    ...Object.fromEntries(Object.keys(identifiers).map(key => [key, draft[key as keyof typeof identifiers]?.trim() || null])),
  };
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setChanges(current => ({ ...current, [key]: value }));
    setResult(null);
    setConfirmed(false);
    setError("");
  }
  async function run(save: boolean) {
    setBusy(true);
    setError("");
    try {
      if (save) {
        await apiFetchJson("/api/salary-structures", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, salaryMonth: `${month}-01`, confirmPackage: confirmed }) });
        await onSaved(month);
      } else {
        const preview = await apiFetchJson<Estimate>("/api/salary-structures/calculate", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, salaryMonth: month, packageEstimate: true }) });
        setResult(preview);
        setReviewing(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete salary review.");
    } finally {
      setBusy(false);
    }
  }
  return <section ref={panel} tabIndex={-1} className={UI.card + " scroll-mt-32 p-4 sm:p-5"} aria-label="Review annual package">
    <h2 className="font-semibold">Review annual package</h2>
    <p className="mt-1 text-sm text-[var(--ats-text-muted)]">Enter the package and effective month, preview the company split, then confirm payroll amounts before saving.</p>
    <fieldset disabled={busy}>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={UI.label}>Annual CTC (₹)<input className={UI.input} type="number" min="0.01" step="0.01" value={draft.ctc} onChange={event => edit("ctc", event.target.value)} /></label>
        <label className={UI.label}>Effective month<input className={UI.input} type="month" value={month} onChange={event => {
          setMonth(event.target.value); setChanges(draft.ctc ? { ctc: draft.ctc } : {}); setResult(null); setConfirmed(false); setError("");
        }} /></label>
      </div>
      {reviewing && <>
        <p className="mt-3 text-sm">Enter confirmed monthly amounts. Enter 0 where a contribution or deduction does not apply.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={UI.label}>Employer PF treatment<select className={UI.select} value={draft.included} onChange={event => edit("included", event.target.value)}>
            <option value="">Choose treatment</option><option value="true">Included in the package</option><option value="false">Paid on top of the package</option>
          </select></label>
          {Object.entries(deductions).map(([name, label]) => {
            const key = name as keyof typeof deductions;
            return <label className={UI.label} key={key}>{label} per month (₹)<input className={UI.input} type="number" min="0" step="0.01" value={draft[key]} onChange={event => edit(key, event.target.value)} /></label>;
          })}
          <label className={UI.label}>Tax regime<select className={UI.select} value={draft.regime} onChange={event => edit("regime", event.target.value as PackageReview["regime"])}>
            <option value="new_regime">New regime</option><option value="old_regime">Old regime</option><option value="manual_tds">Manual TDS</option>
          </select></label>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm">Optional payroll identifiers</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(identifiers).map(([key, [label]]) =>
            <label key={key} className={UI.label}>{label}<input className={UI.input} value={draft[key as keyof typeof identifiers]}
              onChange={event => edit(key as keyof typeof identifiers, key === "pan" ? event.target.value.toUpperCase() : event.target.value)} /></label>)}</div>
        </details>
      </>}
      {result && <div className={UI.sectionCard + " mt-4 p-4 text-sm"} aria-live="polite">
        <h3 className="font-semibold">Monthly breakup</h3>
        <p className="mt-1 text-[var(--ats-text-muted)]">Company split of cash gross uses 30% basic, 15% HRA, 10% special allowance, 12% conveyance and the balance as other allowance. Amounts are rounded to paise.</p>
        {result.estimate.cashGross == null && <p className="mt-2">The suggested earnings below use CTC before employer PF review. Confirm its amount and treatment to calculate cash gross.</p>}
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {([["Annual CTC", result.estimate.ctcAnnual], ["Cash gross", result.estimate.cashGross], ["Employer PF", result.estimate.employerPf],
            ["Total employer cost", result.estimate.totalEmployerCost], ["Employee deductions", result.estimate.totalDeductions], ["Take-home", result.estimate.net],
            ...result.estimate.earnings.map(row => [row.name, row.monthly] as const)] as const).map(([label, amount]) =>
            <div key={label}><dt>{label}</dt><dd className="font-semibold">{rupees(amount)}</dd></div>)}
        </dl>
        {!draft.tds && (result.suggestedTds != null ? <button type="button" className={UI.secondaryButton + " mt-3"} onClick={() => edit("tds", String(result.suggestedTds))}>
          Use suggested TDS {rupees(result.suggestedTds)} for {result.financialYear}
        </button> : <p className="mt-3">Enter verified monthly TDS for {result.financialYear}. A suggestion requires confirmed cash gross and a verified configuration for the selected regime.</p>)}
      </div>}
      {result?.estimate.net != null && <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        I confirm the earnings, PF treatment and all deductions for this effective month.
      </label>}
      {(error || loadError) && <p role="alert" className="mt-3 text-sm text-red-700">{error || "Unable to load the saved setup for this month."}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={UI.secondaryButton} disabled={busy || !month || !draft.ctc || saved.isLoading || loadError} onClick={() => void run(false)}>Preview breakup</button>
        <button type="button" className={UI.primaryButton} disabled={busy || !confirmed || saved.isLoading || loadError} onClick={() => void run(true)}>Save reviewed package</button>
        <button type="button" className={UI.secondaryButton} onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </section>;
}
