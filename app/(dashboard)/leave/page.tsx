"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import EnterpriseTabs, { type EnterpriseTab } from "@/components/enterprise/EnterpriseTabs";
import StatusBadge from "@/components/enterprise/StatusBadge";
import Toast from "@/components/Toast";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { toneFromStatus, toToastTone, toastMsForTone } from "@/lib/operationFeedback";

type LeaveRequest = {
  id: number;
  user_name?: string;
  leave_type: "sick" | "casual";
  from_date: string;
  to_date: string;
  total_days: number;
  paid_days: number;
  lop_days: number;
  reason?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decision_note?: string | null;
};

const TABS: EnterpriseTab[] = [
  { id: "my", label: "My Leave Dashboard" },
  { id: "approvals", label: "Manager Approvals" },
  { id: "holidays", label: "Holidays" },
  { id: "policy", label: "Policy & Balances" },
];

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default function LeavePage() {
  const [tab, setTab] = React.useState("my");
  const [result, setResult] = React.useState<{ tone: "success" | "partial" | "blocked" | "error" | "info"; message: string; hint?: string } | null>(
    null,
  );
  const [busy, setBusy] = React.useState<string | null>(null);

  const [leaveType, setLeaveType] = React.useState<"sick" | "casual">("sick");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [reason, setReason] = React.useState("");

  const [holidayDate, setHolidayDate] = React.useState("");
  const [holidayName, setHolidayName] = React.useState("");

  const [policy, setPolicy] = React.useState({
    sick_accrual_monthly: "1",
    casual_accrual_monthly: "1",
    sick_carry_forward_cap: "12",
    casual_carry_forward_cap: "12",
  });
  const [mapUserId, setMapUserId] = React.useState("");
  const [mapManagerId, setMapManagerId] = React.useState("");

  const dashboardSwr = useSWR<{ balances: Array<any>; requests: LeaveRequest[]; holidays: Array<any> }>(
    "/api/leave/dashboard/me",
    dashboardFetcher,
    { revalidateOnFocus: false },
  );
  const requestsSwr = useSWR<{ requests: LeaveRequest[] }>("/api/leave/requests", dashboardFetcher, { revalidateOnFocus: false });
  const policySwr = useSWR<{ policy: any }>("/api/leave/policies", dashboardFetcher, { revalidateOnFocus: false });
  const usersSwr = useSWR<{ users: Array<{ id: number; full_name: string; email: string; role: string }> }>("/api/leave/users", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const managerMapSwr = useSWR<{ mappings: Array<{ user_id: number; user_name: string; manager_user_id: number; manager_name: string }> }>(
    "/api/leave/manager-map",
    dashboardFetcher,
    { revalidateOnFocus: false },
  );

  React.useEffect(() => {
    if (!policySwr.data?.policy) return;
    const p = policySwr.data.policy;
    setPolicy({
      sick_accrual_monthly: String(p.sick_accrual_monthly ?? "1"),
      casual_accrual_monthly: String(p.casual_accrual_monthly ?? "1"),
      sick_carry_forward_cap: String(p.sick_carry_forward_cap ?? "12"),
      casual_carry_forward_cap: String(p.casual_carry_forward_cap ?? "12"),
    });
  }, [policySwr.data]);

  async function applyLeave() {
    setBusy("apply");
    try {
      const response = await apiFetchJson<{ operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string; hint?: string }>(
        "/api/leave/requests",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leave_type: leaveType, from_date: fromDate, to_date: toDate, reason }),
        },
      );
      setResult({ tone: toneFromStatus(response.operation_status), message: response.user_message || "Leave request submitted.", hint: response.hint });
      setReason("");
      await Promise.all([dashboardSwr.mutate(), requestsSwr.mutate()]);
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to submit leave request." });
    } finally {
      setBusy(null);
    }
  }

  async function decideLeave(requestId: number, decision: "approved" | "rejected") {
    setBusy(`decision-${requestId}`);
    try {
      const response = await apiFetchJson<{ operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string; hint?: string }>(
        `/api/leave/requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      setResult({ tone: toneFromStatus(response.operation_status), message: response.user_message || "Leave decision saved.", hint: response.hint });
      await Promise.all([dashboardSwr.mutate(), requestsSwr.mutate()]);
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to process leave decision." });
    } finally {
      setBusy(null);
    }
  }

  async function addHoliday() {
    setBusy("holiday");
    try {
      const response = await apiFetchJson<{ operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string; hint?: string }>(
        "/api/leave/holidays",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holiday_date: holidayDate, holiday_name: holidayName }),
        },
      );
      setResult({ tone: toneFromStatus(response.operation_status), message: response.user_message || "Holiday saved.", hint: response.hint });
      setHolidayDate("");
      setHolidayName("");
      await dashboardSwr.mutate();
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to save holiday." });
    } finally {
      setBusy(null);
    }
  }

  async function savePolicy() {
    setBusy("policy");
    try {
      const response = await apiFetchJson<{ operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string; hint?: string }>(
        "/api/leave/policies",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sick_accrual_monthly: Number(policy.sick_accrual_monthly || 1),
            casual_accrual_monthly: Number(policy.casual_accrual_monthly || 1),
            sick_carry_forward_cap: Number(policy.sick_carry_forward_cap || 12),
            casual_carry_forward_cap: Number(policy.casual_carry_forward_cap || 12),
          }),
        },
      );
      setResult({ tone: toneFromStatus(response.operation_status), message: response.user_message || "Policy updated.", hint: response.hint });
      await policySwr.mutate();
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to save policy." });
    } finally {
      setBusy(null);
    }
  }

  async function saveManagerMapping() {
    if (!mapUserId || !mapManagerId) {
      setResult({ tone: "blocked", message: "Select employee and manager first." });
      return;
    }
    setBusy("manager-map");
    try {
      const response = await apiFetchJson<{ operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string; hint?: string }>(
        "/api/leave/manager-map",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: Number(mapUserId),
            manager_user_id: Number(mapManagerId),
          }),
        },
      );
      setResult({ tone: toneFromStatus(response.operation_status), message: response.user_message || "Manager mapping updated.", hint: response.hint });
      setMapUserId("");
      setMapManagerId("");
      await managerMapSwr.mutate();
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to map manager." });
    } finally {
      setBusy(null);
    }
  }

  const balances = dashboardSwr.data?.balances || [];
  const myRequests = dashboardSwr.data?.requests || [];
  const approvals = (requestsSwr.data?.requests || []).filter((row) => row.status === "pending" && row.user_name);
  const holidays = dashboardSwr.data?.holidays || [];

  return (
    <AccessGate permissionKey="leave.view_self">
      {result ? (
        <Toast message={result.message} detail={result.hint} variant={toToastTone(result.tone)} autoHideMs={toastMsForTone(result.tone)} onClose={() => setResult(null)} />
      ) : null}
      <ModulePageFrame
        title="HRMS - Leave"
        subtitle="Apply and track leave, approve team requests, manage holidays and policy."
        metrics={<StatusBadge status="IST Policy Boundary" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={UI.secondaryButton + " py-2 text-sm"} href="/salary">Salary</Link>
            <Link className={UI.secondaryButton + " py-2 text-sm"} href="/attendance">Attendance</Link>
            <Link className={UI.secondaryButton + " py-2 text-sm"} href="/timesheet">Timesheet</Link>
            <Link className={UI.secondaryButton + " py-2 text-sm"} href="/team-calendar">Team Calendar</Link>
          </div>
        }
      >
        <EnterpriseTabs tabs={TABS} active={tab} onChange={setTab} className="mb-4" />

        {tab === "my" ? (
          <section className={UI.card + " p-4 sm:p-5"}>
            <h3 className="mb-3 text-base font-semibold text-[var(--ats-text)]">Apply leave</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={UI.label}>Leave type</label>
                <select className={UI.select} value={leaveType} onChange={(e) => setLeaveType(e.target.value as "sick" | "casual")}>
                  <option value="sick">Sick leave</option>
                  <option value="casual">Casual leave</option>
                </select>
              </div>
              <div>
                <label className={UI.label}>From date</label>
                <input type="date" className={UI.input} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className={UI.label}>To date</label>
                <input type="date" className={UI.input} value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div>
                <label className={UI.label}>Reason</label>
                <input className={UI.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <div className="mt-4">
              <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void applyLeave()} disabled={busy === "apply"}>
                {busy === "apply" ? "Submitting..." : "Apply leave"}
              </button>
            </div>

            <div className="mt-6">
              <h4 className="mb-2 text-sm font-semibold text-[var(--ats-text)]">Leave balances</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {balances.map((balance) => (
                  <div key={String(balance.leave_type)} className={UI.sectionCard + " p-3 text-sm"}>
                    <div className="font-semibold capitalize text-[var(--ats-text)]">{String(balance.leave_type)} leave</div>
                    <div className="mt-1 text-[var(--ats-text-muted)]">Accrued: {Number(balance.accrued_days || 0).toFixed(2)} days</div>
                    <div className="text-[var(--ats-text-muted)]">Used: {Number(balance.used_days || 0).toFixed(2)} days</div>
                    <div className="text-[var(--ats-text-muted)]">Remaining: {Number(balance.remaining_days || 0).toFixed(2)} days</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ats-text-muted)]">
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">From</th>
                    <th className="px-2 py-2">To</th>
                    <th className="px-2 py-2">Paid</th>
                    <th className="px-2 py-2">LOP</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--ats-border)]">
                      <td className="px-2 py-2 capitalize">{row.leave_type}</td>
                      <td className="px-2 py-2">{formatDate(row.from_date)}</td>
                      <td className="px-2 py-2">{formatDate(row.to_date)}</td>
                      <td className="px-2 py-2">{Number(row.paid_days || 0).toFixed(2)}</td>
                      <td className="px-2 py-2">{Number(row.lop_days || 0).toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "approvals" ? (
          <section className={UI.card + " p-4 sm:p-5"}>
            <h3 className="mb-3 text-base font-semibold text-[var(--ats-text)]">Pending approvals</h3>
            <div className="space-y-3">
              {approvals.length === 0 ? <div className="text-sm text-[var(--ats-text-muted)]">No pending approvals.</div> : null}
              {approvals.map((row) => (
                <div key={row.id} className={UI.sectionCard + " p-3"}>
                  <div className="text-sm font-semibold text-[var(--ats-text)]">{row.user_name || `Request #${row.id}`}</div>
                  <div className="mt-1 text-xs text-[var(--ats-text-muted)]">
                    {row.leave_type.toUpperCase()} · {formatDate(row.from_date)} - {formatDate(row.to_date)} · Paid {Number(row.paid_days || 0).toFixed(2)} · LOP{" "}
                    {Number(row.lop_days || 0).toFixed(2)}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className={UI.primaryButton + " py-2 text-xs"}
                      disabled={busy === `decision-${row.id}`}
                      onClick={() => void decideLeave(row.id, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={UI.secondaryButton + " py-2 text-xs"}
                      disabled={busy === `decision-${row.id}`}
                      onClick={() => void decideLeave(row.id, "rejected")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "holidays" ? (
          <section className={UI.card + " p-4 sm:p-5"}>
            <h3 className="mb-3 text-base font-semibold text-[var(--ats-text)]">Fixed holidays</h3>
            <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
              <input type="date" className={UI.input} value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
              <input className={UI.input} value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Holiday name" />
              <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void addHoliday()} disabled={busy === "holiday"}>
                Add
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ats-text-muted)]">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Holiday</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((row: any) => (
                    <tr key={Number(row.id)} className="border-t border-[var(--ats-border)]">
                      <td className="px-2 py-2">{formatDate(String(row.holiday_date))}</td>
                      <td className="px-2 py-2">{String(row.holiday_name || "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "policy" ? (
          <section className={UI.card + " p-4 sm:p-5"}>
            <h3 className="mb-3 text-base font-semibold text-[var(--ats-text)]">Policy & balances</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={UI.label}>Sick accrual / month</label>
                <input className={UI.input} value={policy.sick_accrual_monthly} onChange={(e) => setPolicy((p) => ({ ...p, sick_accrual_monthly: e.target.value }))} />
              </div>
              <div>
                <label className={UI.label}>Casual accrual / month</label>
                <input className={UI.input} value={policy.casual_accrual_monthly} onChange={(e) => setPolicy((p) => ({ ...p, casual_accrual_monthly: e.target.value }))} />
              </div>
              <div>
                <label className={UI.label}>Sick carry cap</label>
                <input className={UI.input} value={policy.sick_carry_forward_cap} onChange={(e) => setPolicy((p) => ({ ...p, sick_carry_forward_cap: e.target.value }))} />
              </div>
              <div>
                <label className={UI.label}>Casual carry cap</label>
                <input className={UI.input} value={policy.casual_carry_forward_cap} onChange={(e) => setPolicy((p) => ({ ...p, casual_carry_forward_cap: e.target.value }))} />
              </div>
            </div>
            <div className="mt-4">
              <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void savePolicy()} disabled={busy === "policy"}>
                Save policy
              </button>
            </div>

            <div className="mt-8 border-t border-[var(--ats-border)] pt-5">
              <h4 className="mb-3 text-sm font-semibold text-[var(--ats-text)]">Manager mapping</h4>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <select className={UI.select} value={mapUserId} onChange={(e) => setMapUserId(e.target.value)}>
                  <option value="">Select employee</option>
                  {(usersSwr.data?.users || []).map((user) => (
                    <option key={`u-${user.id}`} value={String(user.id)}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
                <select className={UI.select} value={mapManagerId} onChange={(e) => setMapManagerId(e.target.value)}>
                  <option value="">Select manager</option>
                  {(usersSwr.data?.users || []).map((user) => (
                    <option key={`m-${user.id}`} value={String(user.id)}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={UI.primaryButton + " py-2 text-sm"}
                  onClick={() => void saveManagerMapping()}
                  disabled={busy === "manager-map"}
                >
                  Save mapping
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--ats-text-muted)]">
                      <th className="px-2 py-2">Employee</th>
                      <th className="px-2 py-2">Manager</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(managerMapSwr.data?.mappings || []).map((row) => (
                      <tr key={`${row.user_id}-${row.manager_user_id}`} className="border-t border-[var(--ats-border)]">
                        <td className="px-2 py-2">{row.user_name}</td>
                        <td className="px-2 py-2">{row.manager_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
      </ModulePageFrame>
    </AccessGate>
  );
}
