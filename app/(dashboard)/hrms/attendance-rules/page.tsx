"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { UI } from "@/lib/ui";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";

type RuleRow = {
  user_id: number;
  user_name: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  late_grace_minutes: number;
  early_logout_grace_minutes: number;
  half_day_minutes: number;
  overtime_after_minutes: number;
  wfh_allowed: boolean;
};

type CorrectionRow = {
  id: number;
  user_name: string;
  attendance_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
};

export default function AttendanceRulesPage() {
  const [userId, setUserId] = React.useState("");
  const [shiftName, setShiftName] = React.useState("General");
  const [startTime, setStartTime] = React.useState("09:30");
  const [endTime, setEndTime] = React.useState("18:30");
  const [lateGrace, setLateGrace] = React.useState("15");
  const [earlyGrace, setEarlyGrace] = React.useState("15");
  const [halfDay, setHalfDay] = React.useState("240");
  const [overtimeAfter, setOvertimeAfter] = React.useState("480");
  const [wfhAllowed, setWfhAllowed] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const employeesSwr = useSWR<{ employees: Array<{ id: number; full_name: string }> }>("/api/hrms/employees", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const rulesSwr = useSWR<{ rules: RuleRow[] }>("/api/hrms/attendance-rules", dashboardFetcher, { revalidateOnFocus: false });
  const correctionSwr = useSWR<{ requests: CorrectionRow[] }>("/api/hrms/attendance-corrections", dashboardFetcher, { revalidateOnFocus: false });

  async function saveRule() {
    if (!userId) return setToast({ message: "Select employee.", variant: "blocked" });
    setBusy(true);
    try {
      await apiFetchJson("/api/hrms/attendance-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(userId),
          shiftName,
          startTime,
          endTime,
          lateGraceMinutes: Number(lateGrace || 0),
          earlyLogoutGraceMinutes: Number(earlyGrace || 0),
          halfDayMinutes: Number(halfDay || 0),
          overtimeAfterMinutes: Number(overtimeAfter || 0),
          wfhAllowed,
        }),
      });
      setToast({ message: "Attendance rule saved.", variant: "success" });
      await rulesSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save rule.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function decideCorrection(id: number, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await apiFetchJson("/api/hrms/attendance-corrections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      setToast({ message: `Correction ${decision}.`, variant: "success" });
      await correctionSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update correction.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const rules = rulesSwr.data?.rules || [];
  const corrections = correctionSwr.data?.requests || [];

  return (
    <AccessGate permissionKey="attendance.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Attendance Rules" subtitle="Shift mapping, grace policies, overtime thresholds, and correction approvals.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Shift mapping</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className={UI.select} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select employee</option>
              {(employeesSwr.data?.employees || []).map((employee) => (
                <option key={employee.id} value={String(employee.id)}>
                  {employee.full_name}
                </option>
              ))}
            </select>
            <input className={UI.input} placeholder="Shift name" value={shiftName} onChange={(e) => setShiftName(e.target.value)} />
            <input className={UI.input} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input className={UI.input} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <input className={UI.input} type="number" value={lateGrace} onChange={(e) => setLateGrace(e.target.value)} placeholder="Late grace (mins)" />
            <input className={UI.input} type="number" value={earlyGrace} onChange={(e) => setEarlyGrace(e.target.value)} placeholder="Early logout grace (mins)" />
            <input className={UI.input} type="number" value={halfDay} onChange={(e) => setHalfDay(e.target.value)} placeholder="Half-day minutes" />
            <input className={UI.input} type="number" value={overtimeAfter} onChange={(e) => setOvertimeAfter(e.target.value)} placeholder="Overtime after minutes" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--ats-text)]">
            <input type="checkbox" checked={wfhAllowed} onChange={(e) => setWfhAllowed(e.target.checked)} />
            Work-from-home allowed
          </label>
          <button type="button" className={UI.primaryButton + " mt-4 py-2 text-sm"} onClick={() => void saveRule()} disabled={busy}>
            Save rule
          </button>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Current rules</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Shift</th>
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Grace</th>
                  <th className="px-2 py-2">Half-day</th>
                  <th className="px-2 py-2">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.user_id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{rule.user_name}</td>
                    <td className="px-2 py-2">{rule.shift_name}</td>
                    <td className="px-2 py-2">
                      {rule.start_time} - {rule.end_time}
                    </td>
                    <td className="px-2 py-2">
                      Late {rule.late_grace_minutes}m · Early {rule.early_logout_grace_minutes}m
                    </td>
                    <td className="px-2 py-2">{rule.half_day_minutes}m</td>
                    <td className="px-2 py-2">{rule.overtime_after_minutes}m</td>
                  </tr>
                ))}
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No shift rules available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Attendance correction approvals</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{row.user_name}</td>
                    <td className="px-2 py-2">{new Date(row.attendance_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                    <td className="px-2 py-2">{row.reason}</td>
                    <td className="px-2 py-2 capitalize">{row.status}</td>
                    <td className="px-2 py-2">
                      {row.status === "pending" ? (
                        <div className="flex gap-2">
                          <button type="button" className={UI.primaryButton + " py-1.5 text-xs"} onClick={() => void decideCorrection(row.id, "approved")} disabled={busy}>
                            Approve
                          </button>
                          <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void decideCorrection(row.id, "rejected")} disabled={busy}>
                            Reject
                          </button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {corrections.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No correction requests found.
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
