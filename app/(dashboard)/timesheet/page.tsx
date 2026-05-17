"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import RowActionsMenu from "@/components/enterprise/RowActionsMenu";
import StatusBadge from "@/components/enterprise/StatusBadge";
import Toast from "@/components/Toast";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { toneFromStatus, toToastTone, toastMsForTone } from "@/lib/operationFeedback";

type TimesheetStatus = "draft" | "submitted";

type TimesheetHeader = {
  id: number;
  user_id: number;
  entry_date: string;
  total_minutes: number;
  status: TimesheetStatus;
  notes: string | null;
  updated_at: string;
};

type TimesheetEntry = {
  id: number;
  header_id: number;
  ticket_number: string;
  task_title: string;
  task_description: string | null;
  minutes_spent: number;
  work_type: string | null;
  project_or_client: string | null;
};

type MeResponse = {
  entry_date: string;
  header: TimesheetHeader | null;
  entries: TimesheetEntry[];
};

type SummaryResponse = {
  entry_date: string;
  active_users: number;
  total_sheets: number;
  submitted_sheets: number;
  draft_sheets: number;
  missing_sheets: number;
  total_minutes: number;
};

type RegisterRow = {
  header_id: number;
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  entry_date: string;
  total_minutes: number;
  status: TimesheetStatus;
  notes: string | null;
  entry_count: number;
  updated_at: string;
};

type RegisterResponse = {
  rows: RegisterRow[];
  entry_date: string;
};

type AuthPayload = {
  user?: { role?: string };
  permissions?: Record<string, boolean>;
};

function formatMinutes(minutes: number) {
  const n = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const hours = Math.floor(n / 60);
  return `${hours}h ${n % 60}m`;
}

function toDateInput(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function emptyEntry() {
  return {
    ticket_number: "",
    task_title: "",
    task_description: "",
    minutes_spent: 60,
    work_type: "",
    project_or_client: "",
  };
}

export default function TimesheetPage() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<{ tone: "success" | "partial" | "blocked" | "error" | "info"; message: string; hint?: string } | null>(null);
  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [newEntry, setNewEntry] = useState(emptyEntry);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<TimesheetStatus>("draft");

  const [roleFilter, setRoleFilter] = useState("all");
  const [ticketFilter, setTicketFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedHeaderId, setSelectedHeaderId] = useState<number | null>(null);
  const [selectedHeaderDetails, setSelectedHeaderDetails] = useState<{ header: TimesheetHeader | null; entries: TimesheetEntry[] } | null>(null);

  React.useEffect(() => {
    let active = true;
    apiFetchJson<AuthPayload>("/api/auth/me")
      .then((payload) => {
        if (active) setAuth(payload);
      })
      .catch(() => {
        if (active) setAuth(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const canViewAll = auth?.user?.role === "admin" || auth?.permissions?.["timesheet.view_all"] === true;
  const canManageAll = auth?.user?.role === "admin" || auth?.permissions?.["timesheet.manage_all"] === true;

  const meSwr = useSWR<MeResponse>(`/api/timesheet/me?date=${encodeURIComponent(date)}`, dashboardFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const summarySwr = useSWR<SummaryResponse>(
    canViewAll ? `/api/timesheet/summary?date=${encodeURIComponent(date)}` : null,
    dashboardFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );
  const registerSwr = useSWR<RegisterResponse>(
    canViewAll
      ? `/api/timesheet/register?date=${encodeURIComponent(date)}&role=${encodeURIComponent(roleFilter)}&ticket=${encodeURIComponent(ticketFilter)}&q=${encodeURIComponent(searchFilter)}`
      : null,
    dashboardFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  React.useEffect(() => {
    if (meSwr.data?.header) {
      setNotes(meSwr.data.header.notes || "");
      setStatus(meSwr.data.header.status);
    } else {
      setNotes("");
      setStatus("draft");
    }
  }, [meSwr.data?.header, meSwr.data?.header?.id, meSwr.data?.header?.notes, meSwr.data?.header?.status]);

  React.useEffect(() => {
    setDate((prev) => toDateInput(prev));
  }, []);

  async function refreshAll() {
    await Promise.all([meSwr.mutate(), summarySwr.mutate(), registerSwr.mutate()]);
  }

  async function saveHeader() {
    setBusy("save-header");
    try {
      const response = await apiFetchJson<{
        operation_status?: "success" | "partial" | "blocked" | "error";
        user_message?: string;
        hint?: string;
      }>("/api/timesheet/header", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: date,
          notes,
          status,
        }),
      });
      setResult({
        tone: toneFromStatus(response.operation_status),
        message: response.user_message || "Timesheet header saved.",
        hint: response.hint,
      });
      await refreshAll();
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to save timesheet header." });
    } finally {
      setBusy(null);
    }
  }

  async function addEntry() {
    setBusy("add-entry");
    try {
      const response = await apiFetchJson<{
        operation_status?: "success" | "partial" | "blocked" | "error";
        user_message?: string;
        hint?: string;
      }>("/api/timesheet/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header_id: meSwr.data?.header?.id,
          entry_date: date,
          ...newEntry,
        }),
      });
      setNewEntry(emptyEntry());
      setResult({
        tone: toneFromStatus(response.operation_status),
        message: response.user_message || "Task entry added.",
        hint: response.hint,
      });
      await refreshAll();
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to add task entry." });
    } finally {
      setBusy(null);
    }
  }

  async function removeEntry(entry: TimesheetEntry) {
    setBusy(`delete-${entry.id}`);
    try {
      const response = await apiFetchJson<{
        operation_status?: "success" | "partial" | "blocked" | "error";
        user_message?: string;
        hint?: string;
      }>(`/api/timesheet/entries?header_id=${entry.header_id}&entry_id=${entry.id}`, { method: "DELETE" });
      setResult({
        tone: toneFromStatus(response.operation_status),
        message: response.user_message || "Task entry removed.",
        hint: response.hint,
      });
      await refreshAll();
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to delete task entry." });
    } finally {
      setBusy(null);
    }
  }

  async function loadHeaderDetails(headerId: number) {
    setSelectedHeaderId(headerId);
    try {
      const payload = await apiFetchJson<{ header: TimesheetHeader | null; entries: TimesheetEntry[] }>(
        `/api/timesheet/register?header_id=${headerId}`
      );
      setSelectedHeaderDetails(payload);
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to load sheet details." });
      setSelectedHeaderDetails(null);
    }
  }

  const registerRows = useMemo(() => registerSwr.data?.rows || [], [registerSwr.data]);

  return (
    <AccessGate permissionKey="timesheet.view_self">
      {result ? (
        <Toast
          message={result.message}
          detail={result.hint}
          variant={toToastTone(result.tone)}
          autoHideMs={toastMsForTone(result.tone)}
          onClose={() => setResult(null)}
        />
      ) : null}
      <ModulePageFrame
        title="Timesheet"
        subtitle="Track daily work by ticket and task details. Admin can review all employee timesheets."
        metrics={
          <div className="flex items-center gap-2">
            <StatusBadge status={(meSwr.data?.header?.status || "draft").replace("_", " ")} />
            <span className="text-sm text-[var(--ats-text-muted)]">Date {date}</span>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveHeader()} disabled={busy !== null} className={UI.primaryButton + " py-2 text-sm"}>
              <Save className="h-4 w-4" />
              {busy === "save-header" ? "Saving..." : "Save header"}
            </button>
            <button type="button" onClick={() => void refreshAll()} className={UI.secondaryButton + " py-2 text-sm"}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <section className={UI.enterprise.elevatedCard + " p-5"}>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className={UI.label}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={UI.input} />
              </div>
              <div>
                <label className={UI.label}>Sheet status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as TimesheetStatus)} className={UI.select}>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={UI.label}>Header notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={UI.input} placeholder="Daily summary for this sheet" />
              </div>
            </div>
            <div className="mt-3 text-sm text-[var(--ats-text-muted)]">
              Total worked: <span className="font-semibold text-[var(--ats-text)]">{formatMinutes(meSwr.data?.header?.total_minutes || 0)}</span>
            </div>
          </section>

          <section className={UI.enterprise.elevatedCard + " p-5"}>
            <div className="mb-3 text-sm font-semibold text-[var(--ats-text)]">Add task row</div>
            <div className="grid gap-3 md:grid-cols-6">
              <div>
                <label className={UI.label}>Ticket #</label>
                <input value={newEntry.ticket_number} onChange={(e) => setNewEntry((p) => ({ ...p, ticket_number: e.target.value }))} className={UI.input} placeholder="ATS-101" />
              </div>
              <div className="md:col-span-2">
                <label className={UI.label}>Task title</label>
                <input value={newEntry.task_title} onChange={(e) => setNewEntry((p) => ({ ...p, task_title: e.target.value }))} className={UI.input} placeholder="Pipeline review and shortlist" />
              </div>
              <div>
                <label className={UI.label}>Minutes</label>
                <input type="number" min={1} max={1440} value={newEntry.minutes_spent} onChange={(e) => setNewEntry((p) => ({ ...p, minutes_spent: Number(e.target.value) || 0 }))} className={UI.input} />
              </div>
              <div>
                <label className={UI.label}>Work type</label>
                <input value={newEntry.work_type} onChange={(e) => setNewEntry((p) => ({ ...p, work_type: e.target.value }))} className={UI.input} placeholder="Delivery" />
              </div>
              <div>
                <label className={UI.label}>Project / Client</label>
                <input value={newEntry.project_or_client} onChange={(e) => setNewEntry((p) => ({ ...p, project_or_client: e.target.value }))} className={UI.input} placeholder="Aasthix ATS" />
              </div>
            </div>
            <div className="mt-3">
              <label className={UI.label}>Description (optional)</label>
              <textarea value={newEntry.task_description} onChange={(e) => setNewEntry((p) => ({ ...p, task_description: e.target.value }))} className={UI.input + " min-h-[90px]"} />
            </div>
            <div className="mt-3">
              <button type="button" onClick={() => void addEntry()} disabled={busy !== null} className={UI.primaryButton + " py-2 text-sm"}>
                <Plus className="h-4 w-4" />
                {busy === "add-entry" ? "Adding..." : "Add entry"}
              </button>
            </div>
          </section>

          <section className={UI.enterprise.elevatedCard + " overflow-hidden"}>
            <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm lg:min-w-full">
              <thead className={UI.enterprise.tableHeaderSticky}>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Minutes</th>
                  <th className="px-4 py-3">Work type</th>
                  <th className="px-4 py-3">Project / Client</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {(meSwr.data?.entries || []).map((entry) => (
                  <tr key={entry.id} className={UI.enterprise.tableRow}>
                    <td className="px-4 py-3 font-medium text-[var(--ats-text)]">{entry.ticket_number}</td>
                    <td className="px-4 py-3 text-[var(--ats-text)]">{entry.task_title}</td>
                    <td className="px-4 py-3 text-[var(--ats-text-muted)]">{entry.task_description || "—"}</td>
                    <td className="px-4 py-3 text-[var(--ats-text)]">{entry.minutes_spent}</td>
                    <td className="px-4 py-3 text-[var(--ats-text-muted)]">{entry.work_type || "—"}</td>
                    <td className="px-4 py-3 text-[var(--ats-text-muted)]">{entry.project_or_client || "—"}</td>
                    <td className="px-4 py-3">
                      <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void removeEntry(entry)} disabled={busy !== null}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {(meSwr.data?.entries || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--ats-text-muted)]">No task rows added for this date.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </section>

          {canViewAll ? (
            <>
              <section className="grid gap-3 md:grid-cols-5">
                <div className={UI.enterprise.metricCard + " p-4"}>
                  <div className="text-xs text-[var(--ats-text-soft)] uppercase tracking-[0.14em]">Active users</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--ats-text)]">{summarySwr.data?.active_users ?? 0}</div>
                </div>
                <div className={UI.enterprise.metricCard + " p-4"}>
                  <div className="text-xs text-[var(--ats-text-soft)] uppercase tracking-[0.14em]">Total sheets</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--ats-text)]">{summarySwr.data?.total_sheets ?? 0}</div>
                </div>
                <div className={UI.enterprise.metricCard + " p-4"}>
                  <div className="text-xs text-[var(--ats-text-soft)] uppercase tracking-[0.14em]">Submitted</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--ats-text)]">{summarySwr.data?.submitted_sheets ?? 0}</div>
                </div>
                <div className={UI.enterprise.metricCard + " p-4"}>
                  <div className="text-xs text-[var(--ats-text-soft)] uppercase tracking-[0.14em]">Draft</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--ats-text)]">{summarySwr.data?.draft_sheets ?? 0}</div>
                </div>
                <div className={UI.enterprise.metricCard + " p-4"}>
                  <div className="text-xs text-[var(--ats-text-soft)] uppercase tracking-[0.14em]">Missing</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--ats-text)]">{summarySwr.data?.missing_sheets ?? 0}</div>
                </div>
              </section>

              <section className={UI.enterprise.elevatedCard + " p-5"}>
                <div className="mb-3 text-sm font-semibold text-[var(--ats-text)]">Admin register</div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <label className={UI.label}>Role</label>
                    <select className={UI.select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                      <option value="all">All roles</option>
                      <option value="admin">Admin</option>
                      <option value="recruiter">Recruiter</option>
                      <option value="hiring_manager">Hiring manager</option>
                      <option value="coordinator">Coordinator</option>
                      <option value="employee">Employee</option>
                      <option value="user">User</option>
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Ticket filter</label>
                    <input className={UI.input} value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value)} placeholder="ATS-101" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={UI.label}>Search user</label>
                    <input className={UI.input} value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Name or email" />
                  </div>
                </div>
              </section>

              <section className={UI.enterprise.elevatedCard + " overflow-hidden"}>
                <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-sm lg:min-w-full">
                  <thead className={UI.enterprise.tableHeaderSticky}>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Entries</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registerRows.map((row) => (
                      <tr key={row.header_id} className={UI.enterprise.tableRow}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--ats-text)]">{row.full_name}</div>
                          <div className="text-xs text-[var(--ats-text-muted)]">{row.email}</div>
                        </td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{row.role}</td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{row.entry_date}</td>
                        <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{row.entry_count}</td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{formatMinutes(row.total_minutes)}</td>
                        <td className="px-4 py-3 text-[var(--ats-text-muted)]">{new Date(row.updated_at).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">
                          <RowActionsMenu
                            items={[
                              {
                                type: "button",
                                label: "View entries",
                                onClick: () => {
                                  void loadHeaderDetails(row.header_id);
                                },
                              },
                              ...(canManageAll
                                ? [
                                    {
                                      type: "button" as const,
                                      label: row.status === "submitted" ? "Mark draft" : "Mark submitted",
                                      onClick: () => {
                                        void apiFetchJson("/api/timesheet/register", {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            user_id: row.user_id,
                                            entry_date: row.entry_date,
                                            notes: row.notes || "",
                                            status: row.status === "submitted" ? "draft" : "submitted",
                                          }),
                                        })
                                          .then(async () => {
                                            setResult({ tone: "success", message: "Timesheet status updated." });
                                            await refreshAll();
                                          })
                                          .catch((error) => {
                                            setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to update timesheet status." });
                                          });
                                      },
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                    {registerRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--ats-text-muted)]">
                          No timesheets found for the current filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                </div>
              </section>

              {selectedHeaderId && selectedHeaderDetails ? (
                <section className={UI.enterprise.elevatedCard + " p-5"}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--ats-text)]">Sheet details · Header #{selectedHeaderId}</div>
                    <button type="button" onClick={() => { setSelectedHeaderId(null); setSelectedHeaderDetails(null); }} className={UI.secondaryButton + " py-1.5 text-xs"}>
                      Close
                    </button>
                  </div>
                  <div className="mb-3 text-sm text-[var(--ats-text-muted)]">
                    Status: <span className="font-medium text-[var(--ats-text)]">{selectedHeaderDetails.header?.status || "draft"}</span> · Total:{" "}
                    <span className="font-medium text-[var(--ats-text)]">{formatMinutes(selectedHeaderDetails.header?.total_minutes || 0)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[820px] w-full text-sm">
                      <thead className={UI.enterprise.tableHeaderSticky}>
                        <tr className="text-left text-xs uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">
                          <th className="px-4 py-3">Ticket</th>
                          <th className="px-4 py-3">Task</th>
                          <th className="px-4 py-3">Description</th>
                          <th className="px-4 py-3">Minutes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedHeaderDetails.entries.map((entry) => (
                          <tr key={entry.id} className={UI.enterprise.tableRow}>
                            <td className="px-4 py-3 text-[var(--ats-text)]">{entry.ticket_number}</td>
                            <td className="px-4 py-3 text-[var(--ats-text)]">{entry.task_title}</td>
                            <td className="px-4 py-3 text-[var(--ats-text-muted)]">{entry.task_description || "—"}</td>
                            <td className="px-4 py-3 text-[var(--ats-text)]">{entry.minutes_spent}</td>
                          </tr>
                        ))}
                        {selectedHeaderDetails.entries.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-sm text-[var(--ats-text-muted)]">No entries in this sheet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}
