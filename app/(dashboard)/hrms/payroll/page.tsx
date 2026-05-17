"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { UI } from "@/lib/ui";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";

type PayrollRun = {
  id: number;
  month: number;
  year: number;
  status: "draft" | "generated" | "approved" | "locked";
  generated_by_name?: string;
  approved_by_name?: string;
  generated_at?: string | null;
  approved_at?: string | null;
  locked_by_name?: string;
  unlocked_by_name?: string;
  locked_at?: string | null;
  unlocked_at?: string | null;
  unlock_reason?: string | null;
  notes?: string | null;
};

type OperationFeedback = {
  operation_status?: "success" | "partial" | "blocked" | "error";
  user_message?: string;
  hint?: string;
};

export default function PayrollControlPage() {
  const today = React.useMemo(() => new Date(), []);
  const [month, setMonth] = React.useState(String(today.getMonth() + 1));
  const [year, setYear] = React.useState(String(today.getFullYear()));
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [unlockReasonByRun, setUnlockReasonByRun] = React.useState<Record<number, string>>({});
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);

  const runsSwr = useSWR<{ runs: PayrollRun[] }>("/api/hrms/payroll", dashboardFetcher, { revalidateOnFocus: false });
  const varianceSwr = useSWR<{ variance: Array<{ employee_id: number; employee_name: string; gross_delta: number; deductions_delta: number; net_delta: number }> }>(
    `/api/hrms/payroll?view=variance&month=${Number(month)}&year=${Number(year)}`,
    dashboardFetcher,
    { revalidateOnFocus: false },
  );

  async function generateRun() {
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: Number(month),
          year: Number(year),
          status: "generated",
          notes: notes || null,
        }),
      });
      setToast({
        message: response.user_message || "Payroll run generated.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await runsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to generate run.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function approveRun(id: number) {
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "approve" }),
      });
      setToast({
        message: response.user_message || "Payroll run approved.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await runsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to approve run.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function lockRun(id: number) {
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "lock" }),
      });
      setToast({
        message: response.user_message || "Payroll run locked.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await runsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to lock run.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function unlockRun(id: number) {
    const reason = String(unlockReasonByRun[id] || "").trim();
    if (!reason) {
      setToast({ message: "Unlock reason is required.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "unlock", reason }),
      });
      setToast({
        message: response.user_message || "Payroll run unlocked.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await runsSwr.mutate();
      await varianceSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to unlock run.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessGate permissionKey="payroll.run">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Payroll Control" subtitle="Generate payroll runs, approve payroll cycles, and export HRMS payroll reports.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Monthly payroll generation</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className={UI.select} value={month} onChange={(e) => setMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={String(index + 1)}>
                  {new Date(2000, index, 1).toLocaleString("en-IN", { month: "long" })}
                </option>
              ))}
            </select>
            <input className={UI.input} type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            <input className={UI.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void generateRun()} disabled={busy}>
              Generate run
            </button>
          </div>
          <div className="mt-3">
            <a className={UI.secondaryButton + " py-2 text-sm"} href="/api/hrms/payroll?format=csv">
              Export payroll CSV
            </a>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Variance (vs previous month)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2 text-right">Gross Δ</th>
                  <th className="px-2 py-2 text-right">Deductions Δ</th>
                  <th className="px-2 py-2 text-right">Net Δ</th>
                </tr>
              </thead>
              <tbody>
                {(varianceSwr.data?.variance || []).map((row) => (
                  <tr key={row.employee_id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{row.employee_name}</td>
                    <td className="px-2 py-2 text-right">{Number(row.gross_delta || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2 text-right">{Number(row.deductions_delta || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2 text-right">{Number(row.net_delta || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {(varianceSwr.data?.variance || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No variance rows for selected month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Payroll runs</h2>
          {toast?.variant === "error" || toast?.variant === "blocked" ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Last failure: {toast.message}
            </div>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Month</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Generated by</th>
                  <th className="px-2 py-2">Approved by</th>
                  <th className="px-2 py-2">Lock details</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(runsSwr.data?.runs || []).map((run) => (
                  <tr key={run.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">
                      {new Date(Date.UTC(run.year, run.month - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric" })}
                    </td>
                    <td className="px-2 py-2 capitalize">{run.status}</td>
                    <td className="px-2 py-2">{run.generated_by_name || "-"}</td>
                    <td className="px-2 py-2">{run.approved_by_name || "-"}</td>
                    <td className="px-2 py-2 text-xs text-[var(--ats-text-muted)]">
                      {run.status === "locked" ? (
                        <div>
                          <div>Locked by: {run.locked_by_name || "-"}</div>
                          <div>{run.locked_at ? new Date(run.locked_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</div>
                        </div>
                      ) : run.unlock_reason ? (
                        <div>Last unlock: {run.unlock_reason}</div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {run.status === "draft" || run.status === "generated" ? (
                        <div className="flex gap-2">
                          <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void approveRun(run.id)} disabled={busy}>
                            Approve
                          </button>
                        </div>
                      ) : run.status === "approved" ? (
                        <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void lockRun(run.id)} disabled={busy}>
                          Lock month
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--ats-text-muted)]">Locked</span>
                          <input
                            className={UI.input + " h-8 w-48 text-xs"}
                            placeholder="Unlock reason (admin)"
                            value={unlockReasonByRun[run.id] || ""}
                            onChange={(e) =>
                              setUnlockReasonByRun((prev) => ({
                                ...prev,
                                [run.id]: e.target.value,
                              }))
                            }
                          />
                          <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void unlockRun(run.id)} disabled={busy}>
                            Unlock
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {(runsSwr.data?.runs || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No payroll runs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </ModulePageFrame>
    </AccessGate>
  );
}
