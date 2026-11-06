"use client";

import React from "react";
import useSWR, { useSWRConfig } from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

export type EditableEmployee = {
  id: number; full_name: string; email: string; employee_code?: string; phone?: string;
  department?: string; designation?: string; employment_type?: string; joining_date?: string | null;
  reporting_manager_email?: string; work_location?: string; employment_status?: string; role?: string;
};
function draftFor(employee: EditableEmployee) {
  return { employeeIdCode: employee.employee_code || "", fullName: employee.full_name, email: employee.email,
    phone: employee.phone || "", department: employee.department || "", designation: employee.designation || "",
    employmentType: employee.employment_type || "", joiningDate: employee.joining_date?.slice(0, 10) || "",
    reportingManagerEmail: employee.reporting_manager_email || "", workLocation: employee.work_location || "",
    status: employee.employment_status || "active", role: employee.role || "employee" };
}

export default function EmployeeProfileEditor({ employee, onUpdated }: { employee: EditableEmployee; onUpdated: () => Promise<unknown> }) {
  const { data: me } = useSWR<{ user: { id: number; role: string }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const { mutate } = useSWRConfig();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(() => draftFor(employee));
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const canManage = me?.user.role !== "employee" && me?.permissions["employee_directory.manage"];
  if (!canManage) return null;
  async function refresh() {
    await onUpdated();
    await mutate(`/api/hrms/employees/${employee.id}/login`);
    await mutate("/api/salary-structures");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await apiFetchJson(`/api/hrms/employees/${employee.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      await refresh(); setEditing(false); setMessage("Employee profile updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save employee."); }
    finally { setBusy(false); }
  }
  async function deactivate() {
    if (!window.confirm(`Deactivate ${employee.full_name}? Their login will be blocked. Payslips and attendance history will be retained.`)) return;
    setBusy(true); setMessage("");
    try {
      await apiFetchJson(`/api/hrms/employees/${employee.id}`, { method: "DELETE" });
      await refresh(); setEditing(false); setMessage("Employee deactivated. Payslip and attendance history retained.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to deactivate employee."); }
    finally { setBusy(false); }
  }
  const field = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  return <section className={UI.card + " p-5 mb-5"} aria-label="Manage employee profile">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Manage employee profile</h2><p className="mt-1 text-sm text-[var(--ats-text-muted)]">Update details or deactivate access while keeping employee history.</p></div>
      <div className="flex flex-wrap gap-2">
        {!editing && <button type="button" className={UI.secondaryButton} onClick={() => { setDraft(draftFor(employee)); setEditing(true); setMessage(""); }}>Edit employee</button>}
        {me?.permissions["documents.view_all"] && <a className={UI.secondaryButton} href={`/hrms/documents?employeeId=${employee.id}`}>Manage documents</a>}
        {employee.employment_status !== "inactive" && me?.user.id !== employee.id && <button type="button" className={UI.secondaryButton + " text-rose-700"} disabled={busy} onClick={() => void deactivate()}>Deactivate employee</button>}
      </div>
    </div>
    {editing && <form onSubmit={save} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {([["fullName", "Full name", "text"], ["email", "Email", "email"], ["employeeIdCode", "Employee code", "text"],
          ["phone", "Phone", "text"], ["department", "Department", "text"], ["designation", "Designation", "text"],
          ["employmentType", "Employment type", "text"], ["joiningDate", "Date of joining", "date"],
          ["reportingManagerEmail", "Reporting manager email", "email"], ["workLocation", "Work location", "text"]] as const).map(([key, label, type]) => <label key={key} className={UI.label}>{label}
          <input className={UI.input} type={type} required={key === "fullName" || key === "email"} value={draft[key]} onChange={event => field(key, event.target.value)} />
        </label>)}
        <label className={UI.label}>Employment status<select className={UI.select} value={draft.status} onChange={event => field("status", event.target.value)}>
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="resigned">Resigned</option>
        </select></label>
        <label className={UI.label}>Login role<select className={UI.select} value={draft.role} onChange={event => field("role", event.target.value)}>
          {["employee", "manager", "hiring_manager", "recruiter", "hr", "coordinator", "user"].map(role => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
        </select></label>
      </div>
      <p className="text-sm text-[var(--ats-text-muted)]">Clear an optional field to remove its value. Salary, PAN, PF and bank details are under Salary & Payslips. After changing the joining date, use Employee login to reset the password if needed.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={UI.primaryButton} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
        <button type="button" className={UI.secondaryButton} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button type="button" className={UI.secondaryButton} disabled={busy} onClick={() => setDraft(current => ({ ...current, employeeIdCode: "", phone: "", department: "", designation: "", employmentType: "", joiningDate: "", reportingManagerEmail: "", workLocation: "" }))}>Clear optional details</button>
      </div>
    </form>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
