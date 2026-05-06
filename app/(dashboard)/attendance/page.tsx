"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Clock3, RefreshCw, Settings2, UserCheck, UserX } from "lucide-react";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import RowActionsMenu from "@/components/enterprise/RowActionsMenu";
import StatusBadge from "@/components/enterprise/StatusBadge";
import Toast from "@/components/Toast";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type AttendanceSettings = {
  company_timezone: string;
  start_time_local: string;
  grace_minutes: number;
  working_days: number[];
};

type AttendanceRecord = {
  attendance_date: string;
  status: "present" | "late" | "absent";
  first_check_in_at: string | null;
  last_check_out_at: string | null;
  total_minutes: number;
  source: "self" | "admin" | "system";
  admin_note: string | null;
};

type AttendanceMeResponse = {
  today: string;
  active_session: boolean;
  record: AttendanceRecord | null;
  recent_records: AttendanceRecord[];
  settings: AttendanceSettings;
};

type AttendanceSummaryResponse = {
  attendance_date: string;
  working_day: boolean;
  eligible_users: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  not_checked_in_count: number;
  settings: AttendanceSettings;
};

type AttendanceRegisterRow = {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  attendance_enabled: boolean;
  attendance_date: string;
  status: "present" | "late" | "absent" | "not_checked_in";
  first_check_in_at: string | null;
  last_check_out_at: string | null;
  total_minutes: number;
  source: "self" | "admin" | "system" | null;
  admin_note: string | null;
};

type RegisterResponse = {
  rows: AttendanceRegisterRow[];
  attendance_date: string;
  settings: AttendanceSettings;
};

type MePayload = {
  user?: { role?: string; full_name?: string };
  permissions?: Record<string, boolean>;
};

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMinutes(value: number) {
  const mins = Number.isFinite(value) ? value : 0;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={UI.enterprise.metricCard + " p-4"}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--ats-text)]">{value}</div>
      {note ? <div className="mt-1 text-xs text-[var(--ats-text-muted)]">{note}</div> : null}
    </div>
  );
}

export default function AttendancePage() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "present" | "late" | "absent" | "not_checked_in">("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AttendanceSettings | null>(null);
  const [editRow, setEditRow] = useState<AttendanceRegisterRow | null>(null);
  const [editStatus, setEditStatus] = useState<"present" | "late" | "absent">("present");
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editNote, setEditNote] = useState("");

  React.useEffect(() => {
    let active = true;
    apiFetchJson<MePayload>("/api/auth/me")
      .then((payload) => {
        if (active) setMe(payload);
      })
      .catch(() => {
        if (active) setMe(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const canViewAll = me?.user?.role === "admin" || me?.permissions?.["attendance.view_all"] === true;
  const canManageAll = me?.user?.role === "admin" || me?.permissions?.["attendance.manage_all"] === true;

  const meSwr = useSWR<AttendanceMeResponse>("/api/attendance/me", dashboardFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const summarySwr = useSWR<AttendanceSummaryResponse>(
    `/api/attendance/summary?date=${encodeURIComponent(dateFilter)}`,
    dashboardFetcher,
    {
      refreshInterval: canViewAll ? 60_000 : 0,
      revalidateOnFocus: false,
    }
  );
  const registerSwr = useSWR<RegisterResponse>(
    canViewAll
      ? `/api/attendance/register?date=${encodeURIComponent(dateFilter)}&status=${encodeURIComponent(statusFilter)}&role=${encodeURIComponent(roleFilter)}&q=${encodeURIComponent(query)}`
      : null,
    dashboardFetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    }
  );
  const settingsSwr = useSWR<{ settings: AttendanceSettings }>("/api/attendance/settings", dashboardFetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  React.useEffect(() => {
    if (settingsSwr.data?.settings) setSettingsDraft(settingsSwr.data.settings);
  }, [settingsSwr.data]);

  async function runSelfAction(kind: "check-in" | "check-out") {
    setBusy(kind);
    try {
      await apiFetchJson(`/api/attendance/${kind}`, { method: "POST" });
      setToast({ message: kind === "check-in" ? "Checked in for today." : "Checked out successfully.", variant: "success" });
      await Promise.all([meSwr.mutate(), summarySwr.mutate(), registerSwr.mutate()]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Attendance action failed.";
      setToast({ message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setBusy("save-settings");
    try {
      await apiFetchJson("/api/attendance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });
      setToast({ message: "Attendance settings updated.", variant: "success" });
      await Promise.all([settingsSwr.mutate(), meSwr.mutate(), summarySwr.mutate()]);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save settings.", variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function markAbsentForDate() {
    setBusy("mark-absent");
    try {
      await apiFetchJson("/api/attendance/register", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_absent_for_date", attendance_date: dateFilter }),
      });
      setToast({ message: `Absent records synced for ${formatDate(dateFilter)}.`, variant: "success" });
      await Promise.all([summarySwr.mutate(), registerSwr.mutate()]);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to sync absent records.", variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  function openEdit(row: AttendanceRegisterRow) {
    setEditRow(row);
    setEditStatus(row.status === "not_checked_in" ? "absent" : row.status);
    setEditCheckIn(row.first_check_in_at ? row.first_check_in_at.slice(0, 16) : "");
    setEditCheckOut(row.last_check_out_at ? row.last_check_out_at.slice(0, 16) : "");
    setEditNote(row.admin_note || "");
  }

  async function saveEdit() {
    if (!editRow) return;
    setBusy("save-edit");
    try {
      await apiFetchJson("/api/attendance/register", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editRow.user_id,
          attendance_date: editRow.attendance_date,
          status: editStatus,
          first_check_in_at: editCheckIn ? new Date(editCheckIn).toISOString() : null,
          last_check_out_at: editCheckOut ? new Date(editCheckOut).toISOString() : null,
          admin_note: editNote || null,
        }),
      });
      setToast({ message: `Attendance updated for ${editRow.full_name}.`, variant: "success" });
      setEditRow(null);
      await Promise.all([summarySwr.mutate(), registerSwr.mutate(), meSwr.mutate()]);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save attendance record.", variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  const recentRows = useMemo(() => meSwr.data?.recent_records || [], [meSwr.data]);
  const registerRows = useMemo(() => registerSwr.data?.rows || [], [registerSwr.data]);
  const todayStatus = meSwr.data?.record?.status?.replace(/_/g, " ") || "not checked in";

  return (
    <AccessGate permissionKey="attendance.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={3500} /> : null}
      <ModulePageFrame
        title="Attendance"
        subtitle="Track employee check-in and check-out inside the ATS with a company-wide daily register."
        metrics={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={todayStatus} />
            <span className="text-sm text-[var(--ats-text-muted)]">
              {meSwr.data?.settings.company_timezone || "Asia/Kolkata"} · Start {meSwr.data?.settings.start_time_local || "09:30"}
            </span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void runSelfAction("check-in")} disabled={busy !== null || Boolean(meSwr.data?.record?.first_check_in_at)} className={UI.primaryButton + " py-2 text-sm"}>
              <CheckCircle2 className="h-4 w-4" />
              {busy === "check-in" ? "Checking in…" : "Check in"}
            </button>
            <button type="button" onClick={() => void runSelfAction("check-out")} disabled={busy !== null || !meSwr.data?.record?.first_check_in_at || Boolean(meSwr.data?.record?.last_check_out_at)} className={UI.secondaryButton + " py-2 text-sm"}>
              <Clock3 className="h-4 w-4" />
              {busy === "check-out" ? "Checking out…" : "Check out"}
            </button>
            <button type="button" onClick={() => { void meSwr.mutate(); void summarySwr.mutate(); void registerSwr.mutate(); }} className={UI.secondaryButton + " py-2 text-sm"}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        }
        banner={
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Today" value={formatDate(meSwr.data?.today || dateFilter)} note="Company attendance day" />
            <MetricCard label="Check in" value={formatDateTime(meSwr.data?.record?.first_check_in_at)} />
            <MetricCard label="Check out" value={formatDateTime(meSwr.data?.record?.last_check_out_at)} />
            <MetricCard label="Worked" value={formatMinutes(meSwr.data?.record?.total_minutes || 0)} note={meSwr.data?.active_session ? "Session active" : "Today"} />
          </div>
        }
      >
        <div className="space-y-5">
          {canViewAll ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Eligible users" value={summarySwr.data?.eligible_users ?? 0} note={summarySwr.data?.working_day ? "Working day" : "Non-working day"} />
                <MetricCard label="Present" value={summarySwr.data?.present_count ?? 0} />
                <MetricCard label="Late" value={summarySwr.data?.late_count ?? 0} />
                <MetricCard label="Absent" value={summarySwr.data?.absent_count ?? 0} />
                <MetricCard label="Not checked in" value={summarySwr.data?.not_checked_in_count ?? 0} />
              </div>

              <section className={UI.enterprise.elevatedCard + " p-5"}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[var(--ats-text)]">Daily attendance register</div>
                    <div className="mt-1 text-sm text-[var(--ats-text-muted)]">Review the team for a selected day and correct missed records when needed.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManageAll ? (
                      <button type="button" onClick={() => void markAbsentForDate()} disabled={busy !== null} className={UI.secondaryButton + " py-2 text-xs"}>
                        <UserX className="h-4 w-4" />
                        {busy === "mark-absent" ? "Syncing…" : "Mark missing absent"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  <div>
                    <label className={UI.label}>Date</label>
                    <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={UI.input} />
                  </div>
                  <div>
                    <label className={UI.label}>Status</label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={UI.select}>
                      <option value="all">All status</option>
                      <option value="present">Present</option>
                      <option value="late">Late</option>
                      <option value="absent">Absent</option>
                      <option value="not_checked_in">Not checked in</option>
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Role</label>
                    <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={UI.select}>
                      <option value="all">All roles</option>
                      <option value="admin">Admin</option>
                      <option value="recruiter">Recruiter</option>
                      <option value="hiring_manager">Hiring manager</option>
                      <option value="coordinator">Coordinator</option>
                      <option value="employee">Employee</option>
                      <option value="user">User</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={UI.label}>Search</label>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" className={UI.input} />
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--ats-border)]">
                  <div className="max-h-[55vh] overflow-auto">
                    <table className="w-full table-fixed text-sm">
                      <thead className={UI.enterprise.tableHeaderSticky}>
                        <tr className="text-left text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                          <th className="px-4 py-3 w-[18%]">Employee</th>
                          <th className="px-4 py-3 w-[12%]">Role</th>
                          <th className="px-4 py-3 w-[12%]">Status</th>
                          <th className="px-4 py-3 w-[16%]">Check in</th>
                          <th className="px-4 py-3 w-[16%]">Check out</th>
                          <th className="px-4 py-3 w-[10%]">Worked</th>
                          <th className="px-4 py-3 w-[8%]">Source</th>
                          <th className="px-4 py-3 w-[8%] text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--enterprise-table-border)]">
                        {registerRows.map((row) => (
                          <tr key={`${row.user_id}-${row.attendance_date}`} className={UI.enterprise.tableRow}>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-[var(--ats-text)]">{row.full_name}</div>
                              <div className="text-xs text-[var(--ats-text-muted)]">{row.email}</div>
                            </td>
                            <td className="px-4 py-3 text-[var(--ats-text-muted)]">{row.role}</td>
                            <td className="px-4 py-3"><StatusBadge status={row.status.replace(/_/g, " ")} /></td>
                            <td className="px-4 py-3 text-[var(--ats-text)]">{formatDateTime(row.first_check_in_at)}</td>
                            <td className="px-4 py-3 text-[var(--ats-text)]">{formatDateTime(row.last_check_out_at)}</td>
                            <td className="px-4 py-3 text-[var(--ats-text)]">{formatMinutes(row.total_minutes)}</td>
                            <td className="px-4 py-3 text-[var(--ats-text-muted)]">{row.source || "—"}</td>
                            <td className="px-4 py-3 text-right">
                              {canManageAll ? (
                                <RowActionsMenu
                                  items={[
                                    {
                                      type: "button",
                                      label: "Edit attendance",
                                      onClick: () => openEdit(row),
                                    },
                                  ]}
                                />
                              ) : null}
                            </td>
                          </tr>
                        ))}
                        {registerRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--ats-text-muted)]">
                              No attendance rows matched the current filters.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {canManageAll && settingsDraft ? (
                <section className={UI.enterprise.elevatedCard + " p-5"}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ats-text)]">
                    <Settings2 className="h-4 w-4 text-[var(--ats-primary)]" />
                    Attendance settings
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div>
                      <label className={UI.label}>Company timezone</label>
                      <input value={settingsDraft.company_timezone} onChange={(e) => setSettingsDraft({ ...settingsDraft, company_timezone: e.target.value })} className={UI.input} />
                    </div>
                    <div>
                      <label className={UI.label}>Start time</label>
                      <input type="time" value={settingsDraft.start_time_local} onChange={(e) => setSettingsDraft({ ...settingsDraft, start_time_local: e.target.value })} className={UI.input} />
                    </div>
                    <div>
                      <label className={UI.label}>Grace minutes</label>
                      <input type="number" min={0} max={240} value={settingsDraft.grace_minutes} onChange={(e) => setSettingsDraft({ ...settingsDraft, grace_minutes: Number(e.target.value || 0) })} className={UI.input} />
                    </div>
                    <div>
                      <label className={UI.label}>Working days</label>
                      <input value={settingsDraft.working_days.join(",")} onChange={(e) => setSettingsDraft({ ...settingsDraft, working_days: e.target.value.split(",").map((part) => Number(part.trim())).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6) })} className={UI.input} />
                      <div className="mt-1 text-xs text-[var(--ats-text-muted)]">0=Sun, 1=Mon … 6=Sat</div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="button" onClick={() => void saveSettings()} disabled={busy !== null} className={UI.primaryButton + " py-2 text-sm"}>
                      <Settings2 className="h-4 w-4" />
                      {busy === "save-settings" ? "Saving…" : "Save settings"}
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          <section className={UI.enterprise.elevatedCard + " p-5"}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ats-text)]">
              <UserCheck className="h-4 w-4 text-[var(--ats-primary)]" />
              Your recent attendance
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--ats-border)]">
              <div className="max-h-[42vh] overflow-auto">
                <table className="w-full table-fixed text-sm">
                  <thead className={UI.enterprise.tableHeaderSticky}>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                      <th className="px-4 py-3 w-[22%]">Date</th>
                      <th className="px-4 py-3 w-[16%]">Status</th>
                      <th className="px-4 py-3 w-[20%]">Check in</th>
                      <th className="px-4 py-3 w-[20%]">Check out</th>
                      <th className="px-4 py-3 w-[12%]">Worked</th>
                      <th className="px-4 py-3 w-[10%]">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--enterprise-table-border)]">
                    {recentRows.map((row) => (
                      <tr key={row.attendance_date} className={UI.enterprise.tableRow}>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{formatDate(row.attendance_date)}</td>
                        <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{formatDateTime(row.first_check_in_at)}</td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{formatDateTime(row.last_check_out_at)}</td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{formatMinutes(row.total_minutes)}</td>
                        <td className="px-4 py-3 text-[var(--ats-text-muted)]">{row.source}</td>
                      </tr>
                    ))}
                    {recentRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--ats-text-muted)]">
                          No recent attendance records yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {editRow ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[1.6rem] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-6 shadow-[var(--ats-shadow-md)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-[var(--ats-text)]">Edit attendance</div>
                  <div className="mt-1 text-sm text-[var(--ats-text-muted)]">{editRow.full_name} · {formatDate(editRow.attendance_date)}</div>
                </div>
                <button type="button" onClick={() => setEditRow(null)} className={UI.secondaryButton + " py-2 text-xs"}>Close</button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className={UI.label}>Status</label>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as typeof editStatus)} className={UI.select}>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
                <div>
                  <label className={UI.label}>Admin note</label>
                  <input value={editNote} onChange={(e) => setEditNote(e.target.value)} className={UI.input} placeholder="Optional correction note" />
                </div>
                <div>
                  <label className={UI.label}>First check-in</label>
                  <input type="datetime-local" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} className={UI.input} disabled={editStatus === "absent"} />
                </div>
                <div>
                  <label className={UI.label}>Last check-out</label>
                  <input type="datetime-local" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} className={UI.input} disabled={editStatus === "absent"} />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setEditRow(null)} className={UI.secondaryButton + " py-2 text-sm"}>Cancel</button>
                <button type="button" onClick={() => void saveEdit()} disabled={busy !== null} className={UI.primaryButton + " py-2 text-sm"}>
                  {busy === "save-edit" ? "Saving…" : "Save attendance"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ModulePageFrame>
    </AccessGate>
  );
}
