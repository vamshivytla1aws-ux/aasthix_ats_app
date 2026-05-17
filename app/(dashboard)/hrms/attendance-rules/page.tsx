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

type WfhRow = {
  id: number;
  user_id: number;
  user_name: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decision_note?: string | null;
};

type OperationFeedback = {
  operation_status?: "success" | "partial" | "blocked" | "error";
  user_message?: string;
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
  const [wfhFromDate, setWfhFromDate] = React.useState("");
  const [wfhToDate, setWfhToDate] = React.useState("");
  const [wfhReason, setWfhReason] = React.useState("");
  const [wfhDecisionNote, setWfhDecisionNote] = React.useState("");
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const employeesSwr = useSWR<{ employees: Array<{ id: number; full_name: string }> }>("/api/hrms/employees", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const rulesSwr = useSWR<{ rules: RuleRow[] }>("/api/hrms/attendance-rules", dashboardFetcher, { revalidateOnFocus: false });
  const correctionSwr = useSWR<{ requests: CorrectionRow[] }>("/api/hrms/attendance-corrections", dashboardFetcher, { revalidateOnFocus: false });
  const wfhSwr = useSWR<{ requests: WfhRow[] }>("/api/hrms/wfh-requests", dashboardFetcher, { revalidateOnFocus: false });

  function feedbackToVariant(feedback?: OperationFeedback) {
    if (feedback?.operation_status === "blocked") return "blocked" as const;
    if (feedback?.operation_status === "error") return "error" as const;
    return "success" as const;
  }

  async function saveRule() {
    if (!userId) return setToast({ message: "Select employee.", variant: "blocked" });
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/attendance-rules", {
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
      setToast({ message: response.user_message || "Attendance rule saved.", variant: feedbackToVariant(response) });
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
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/attendance-corrections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      setToast({ message: response.user_message || `Correction ${decision}.`, variant: feedbackToVariant(response) });
      await correctionSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update correction.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function createWfhRequest() {
    if (!wfhFromDate || !wfhToDate || !wfhReason.trim()) {
      setToast({ message: "From date, to date and reason are required.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/wfh-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: wfhFromDate, toDate: wfhToDate, reason: wfhReason.trim() }),
      });
      setToast({ message: response.user_message || "WFH request submitted.", variant: feedbackToVariant(response) });
      setWfhFromDate("");
      setWfhToDate("");
      setWfhReason("");
      await wfhSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to submit WFH request.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function decideWfh(id: number, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/wfh-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, note: wfhDecisionNote || null }),
      });
      setToast({ message: response.user_message || `WFH request ${decision}.`, variant: feedbackToVariant(response) });
      setWfhDecisionNote("");
      await wfhSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update WFH request.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const rules = rulesSwr.data?.rules || [];
  const corrections = correctionSwr.data?.requests || [];
  const wfhRequests = wfhSwr.data?.requests || [];

  return (
    <AccessGate permissionKey="attendance.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Attendance Rules" subtitle="Shift mapping, grace policies, WFH controls, and correction approvals.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Shift mapping</h2>
          <p className="mt-1 text-xs text-[var(--ats-text-muted)]">
            Configure shift boundaries and policy thresholds in minutes. Example: Late grace 15 means check-in up to 15 minutes after shift start is not marked late.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className={UI.label}>
              Employee
              <select className={UI.select} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Select employee</option>
                {(employeesSwr.data?.employees || []).map((employee) => (
                  <option key={employee.id} value={String(employee.id)}>
                    {employee.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={UI.label}>
              Shift name
              <input className={UI.input} placeholder="General" value={shiftName} onChange={(e) => setShiftName(e.target.value)} />
            </label>
            <label className={UI.label}>
              Shift start
              <input className={UI.input} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className={UI.label}>
              Shift end
              <input className={UI.input} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
            <label className={UI.label}>
              Late grace (minutes)
              <input className={UI.input} type="number" value={lateGrace} onChange={(e) => setLateGrace(e.target.value)} placeholder="0-240" />
            </label>
            <label className={UI.label}>
              Early logout grace (minutes)
              <input className={UI.input} type="number" value={earlyGrace} onChange={(e) => setEarlyGrace(e.target.value)} placeholder="0-240" />
            </label>
            <label className={UI.label}>
              Half-day threshold (minutes worked)
              <input className={UI.input} type="number" value={halfDay} onChange={(e) => setHalfDay(e.target.value)} placeholder="0-720" />
            </label>
            <label className={UI.label}>
              Overtime starts after (minutes worked)
              <input className={UI.input} type="number" value={overtimeAfter} onChange={(e) => setOvertimeAfter(e.target.value)} placeholder="0-960" />
            </label>
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
                  <th className="px-2 py-2">WFH</th>
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
                      Late {rule.late_grace_minutes}m | Early {rule.early_logout_grace_minutes}m
                    </td>
                    <td className="px-2 py-2">{rule.half_day_minutes}m</td>
                    <td className="px-2 py-2">{rule.overtime_after_minutes}m</td>
                    <td className="px-2 py-2">{rule.wfh_allowed ? "Allowed" : "Not allowed"}</td>
                  </tr>
                ))}
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No shift rules available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Work from home requests</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input className={UI.input} type="date" value={wfhFromDate} onChange={(e) => setWfhFromDate(e.target.value)} />
            <input className={UI.input} type="date" value={wfhToDate} onChange={(e) => setWfhToDate(e.target.value)} />
            <input className={UI.input} placeholder="Reason" value={wfhReason} onChange={(e) => setWfhReason(e.target.value)} />
            <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={() => void createWfhRequest()} disabled={busy}>
              Apply WFH
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">From</th>
                  <th className="px-2 py-2">To</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {wfhRequests.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{row.user_name}</td>
                    <td className="px-2 py-2">{String(row.from_date).slice(0, 10)}</td>
                    <td className="px-2 py-2">{String(row.to_date).slice(0, 10)}</td>
                    <td className="px-2 py-2">{row.reason}</td>
                    <td className="px-2 py-2 capitalize">{row.status}</td>
                    <td className="px-2 py-2">
                      {row.status === "pending" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className={UI.input + " min-w-[180px] py-1.5 text-xs"}
                            placeholder="Decision note (optional)"
                            value={wfhDecisionNote}
                            onChange={(e) => setWfhDecisionNote(e.target.value)}
                          />
                          <button type="button" className={UI.primaryButton + " py-1.5 text-xs"} onClick={() => void decideWfh(row.id, "approved")} disabled={busy}>
                            Approve
                          </button>
                          <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void decideWfh(row.id, "rejected")} disabled={busy}>
                            Reject
                          </button>
                        </div>
                      ) : (
                        row.decision_note || "-"
                      )}
                    </td>
                  </tr>
                ))}
                {wfhRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No WFH requests found.
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
