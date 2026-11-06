"use client";

import React from "react";
import useSWR, { useSWRConfig } from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import { DatePicker } from "@/components/ui/DateTimeFields";
import { isEmployeeProfileCache } from "@/lib/hrms/employeeProfileCache";

type Employee = {
  id: number;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  employment_type: string;
  joining_date: string | null;
  work_location: string;
  employment_status: "active" | "inactive" | "resigned";
  reporting_manager_user_id: number | null;
  reporting_manager_name: string;
  reporting_manager_email?: string;
  role: string;
  profile_completeness: number;
};

type EmployeeImportRowResult = {
  rowNumber: number;
  status: "valid" | "invalid" | "conflict";
  message: string;
  normalized?: Record<string, unknown>;
};

const EMPTY_FORM = {
  employeeIdCode: "",
  fullName: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  employmentType: "",
  joiningDate: "",
  reportingManagerEmail: "",
  workLocation: "",
  status: "active",
  role: "employee",
};

export default function EmployeeDirectoryPage() {
  const { mutate: refreshCaches } = useSWRConfig();
  const { data: me } = useSWR<{ user: { role: string }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const canManage = me?.user.role !== "employee" && me?.permissions["employee_directory.manage"] === true;
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [departmentFilter, setDepartmentFilter] = React.useState("all");
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const formSectionRef = React.useRef<HTMLElement>(null);
  const fullNameRef = React.useRef<HTMLInputElement>(null);
  const [assignManagerLater, setAssignManagerLater] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);
  const [saveFeedback, setSaveFeedback] = React.useState<{ message: string; error: boolean } | null>(null);
  const [importRows, setImportRows] = React.useState<EmployeeImportRowResult[]>([]);
  const [importSummary, setImportSummary] = React.useState<{ valid: number; invalid: number; conflict: number } | null>(null);

  const employeesUrl = React.useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (statusFilter !== "all") sp.set("status", statusFilter);
    if (departmentFilter !== "all") sp.set("department", departmentFilter);
    return `/api/hrms/employees?${sp.toString()}`;
  }, [q, statusFilter, departmentFilter]);
  const { data, error: employeesError, mutate } = useSWR<{ employees: Employee[] }>(employeesUrl, dashboardFetcher, { revalidateOnFocus: false });

  const employees = React.useMemo(() => data?.employees ?? [], [data?.employees]);
  const departmentOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const row of employees) {
      const v = String(row.department || "").trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  function resetForm() {
    setSaveFeedback(null);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAssignManagerLater(true);
  }

  function startEdit(employee: Employee) {
    setSaveFeedback(null);
    setEditingId(employee.id);
    setForm({
      employeeIdCode: employee.employee_code || "",
      fullName: employee.full_name || "",
      email: employee.email || "",
      phone: employee.phone || "",
      department: employee.department || "",
      designation: employee.designation || "",
      employmentType: employee.employment_type || "",
      joiningDate: employee.joining_date ? String(employee.joining_date).slice(0, 10) : "",
      reportingManagerEmail: employee.reporting_manager_email || "",
      workLocation: employee.work_location || "",
      status: employee.employment_status || "active",
      role: employee.role || "employee",
    });
    setAssignManagerLater(!employee.reporting_manager_email);
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      fullNameRef.current?.focus({ preventScroll: true });
    });
  }

  async function submitForm() {
    setSaveFeedback(null);
    if (!form.fullName.trim() || !form.email.trim()) {
      setSaveFeedback({ message: "Full name and email are required.", error: true });
      setToast({ message: "Full name and email are required.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await apiFetchJson(`/api/hrms/employees/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            reportingManagerEmail: assignManagerLater ? null : form.reportingManagerEmail.trim() || null,
          }),
        });
      } else {
        await apiFetchJson("/api/hrms/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            reportingManagerEmail: assignManagerLater ? null : form.reportingManagerEmail.trim() || null,
          }),
        });
      }
      await refreshCaches(key => isEmployeeProfileCache(key, editingId || 0));
      setToast({ message: editingId ? "Employee details saved." : "Employee created.", variant: "success" });
      resetForm();
      setSaveFeedback({ message: `Saved details for ${form.fullName}.`, error: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save employee.";
      setSaveFeedback({ message, error: true });
      setToast({ message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: number) {
    setBusy(true);
    try {
      await apiFetchJson(`/api/hrms/employees/${id}`, { method: "DELETE" });
      setToast({ message: "Employee marked inactive.", variant: "success" });
      await mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to deactivate employee.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function previewImport(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await apiFetchJson<{
        rows: EmployeeImportRowResult[];
        summary: { valid: number; invalid: number; conflict: number };
        user_message?: string;
      }>("/api/hrms/employees/import-csv", { method: "POST", body: formData });
      setImportRows(response.rows || []);
      setImportSummary(response.summary || { valid: 0, invalid: 0, conflict: 0 });
      setToast({ message: response.user_message || "CSV preview ready.", variant: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to parse CSV.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!importSummary || importSummary.valid === 0) {
      setToast({ message: "No valid rows available to import.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetchJson<{ user_message?: string }>("/api/hrms/employees/import-csv/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      setToast({ message: response.user_message || "Employees imported successfully.", variant: "success" });
      setImportRows([]);
      setImportSummary(null);
      await mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to import employees.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessGate permissionKey="employee_directory.view_all">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Employee Directory" subtitle="Add, update, search, and manage employee lifecycle status.">
        {canManage && <section ref={formSectionRef} aria-label="Employee details form" className={UI.card + " scroll-mt-40 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">{editingId ? "Edit employee" : "Add employee"}</h2>
          <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
            {editingId ? `Editing ${form.fullName}. Update the details below and select Update employee.` : "Sections: Identity, Employment, Reporting, and Access. Use Assign manager later if manager or director is not created yet."}
          </div>
          <fieldset disabled={busy} className="mt-3 grid gap-3 md:grid-cols-3">
            <label className={UI.label}>Employee code<input className={UI.input} placeholder="Auto-generated if left blank" value={form.employeeIdCode} onChange={(e) => setForm((s) => ({ ...s, employeeIdCode: e.target.value }))} /></label>
            <label className={UI.label}>Full name (required)<input ref={fullNameRef} className={UI.input} placeholder="Full name" value={form.fullName} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} /></label>
            <label className={UI.label}>Email (required)<input className={UI.input} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} /></label>
            <label className={UI.label}>Phone<input className={UI.input} placeholder="Phone" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} /></label>
            <label className={UI.label}>Department<input className={UI.input} placeholder="e.g. Engineering" value={form.department} onChange={(e) => setForm((s) => ({ ...s, department: e.target.value }))} /></label>
            <label className={UI.label}>Designation / job title<input className={UI.input} placeholder="e.g. Software Engineer II" value={form.designation} onChange={(e) => setForm((s) => ({ ...s, designation: e.target.value }))} /></label>
            <label className={UI.label}>Employment type<input className={UI.input} placeholder="e.g. Permanent or Contract" value={form.employmentType} onChange={(e) => setForm((s) => ({ ...s, employmentType: e.target.value }))} /></label>
            <div><label htmlFor="employee-joining-date" className={UI.label}>Date of joining</label><DatePicker id="employee-joining-date" aria-label="Date of joining" value={form.joiningDate} onChange={(value) => setForm((s) => ({ ...s, joiningDate: value }))} placeholder="DD-MM-YYYY" /></div>
            <label className={UI.label}>Work location<input className={UI.input} placeholder="e.g. Bangalore" value={form.workLocation} onChange={(e) => setForm((s) => ({ ...s, workLocation: e.target.value }))} /></label>
            <label className={UI.label}>Employment status<select aria-label="Employment status" className={UI.select} value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
            </select></label>
            <label className={UI.label}>Login role<select aria-label="Login role" className={UI.select} value={form.role} onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="recruiter">Recruiter</option>
              <option value="hr">HR</option>
            </select></label>
            <label className={UI.label}>Reporting manager / director email<input
              className={UI.input}
              placeholder="Reporting manager / director email"
              disabled={assignManagerLater}
              value={form.reportingManagerEmail}
              onChange={(e) => setForm((s) => ({ ...s, reportingManagerEmail: e.target.value }))}
            /></label>
            <label className={UI.label + " flex items-center gap-2"}>
              <input
                type="checkbox"
                checked={assignManagerLater}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAssignManagerLater(checked);
                  if (checked) setForm((s) => ({ ...s, reportingManagerEmail: "" }));
                }}
              />
              Assign manager later
            </label>
          </fieldset>
          <p className="mt-3 text-xs text-[var(--ats-text-muted)]">Designation is the employee&apos;s job title. Login role controls their access to the application. Only full name and email are required.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void submitForm()} disabled={busy}>
              {editingId ? "Update employee" : "Add employee"}
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={resetForm} disabled={busy}>
              {editingId ? "Cancel editing" : "Reset"}
            </button>
          </div>
          {saveFeedback && <p role={saveFeedback.error ? "alert" : "status"} className={`mt-3 rounded-lg border p-3 text-sm ${saveFeedback.error ? "border-rose-200 text-rose-700" : "border-teal-200 text-teal-800"}`}>{saveFeedback.message}</p>}
        </section>}

        {canManage && <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Bulk import (CSV)</h2>
            <a className={UI.secondaryButton + " py-2 text-sm"} href={`/api/hrms/employees/export-csv?q=${encodeURIComponent(q)}`}>
              Export directory CSV
            </a>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a className={UI.secondaryButton + " py-2 text-sm"} href="/assets/hrms/employee-import-template.csv" download>
              Download template
            </a>
            <input
              className={UI.input}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void previewImport(e.target.files?.[0] || null)}
            />
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void commitImport()} disabled={busy || !importSummary || importSummary.valid === 0}>
              Commit valid rows
            </button>
          </div>
          {importSummary ? (
            <div className="mt-3 rounded-lg border border-[var(--ats-border)] bg-[var(--ats-fill-1)] px-3 py-2 text-xs text-[var(--ats-text-muted)]">
              Valid: {importSummary.valid} · Invalid: {importSummary.invalid} · Conflict: {importSummary.conflict}
            </div>
          ) : null}
          {importRows.length > 0 ? (
            <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-[var(--ats-border)]">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--ats-text-muted)]">
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-[var(--ats-border)]">
                      <td className="px-2 py-1.5">{row.rowNumber}</td>
                      <td className="px-2 py-1.5 capitalize">{row.status}</td>
                      <td className="px-2 py-1.5">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>}

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          {employeesError && <div role="alert" className="mb-3 rounded-lg border border-rose-200 p-3 text-sm text-rose-700">Unable to load the employee directory. <button type="button" className="underline" onClick={() => void mutate()}>Try again</button></div>}
          <div className="grid gap-2 md:grid-cols-4">
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Employees</h2>
            <input className={UI.input} placeholder="Search by name, email, phone, employee ID..." value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={UI.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
            </select>
            <select className={UI.select} value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option value="all">All departments</option>
              {departmentOptions.map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>
          </div>
          {toast?.variant === "error" || toast?.variant === "blocked" ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Last failure: {toast.message}
            </div>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Department</th>
                  <th className="px-2 py-2">Designation</th>
                  <th className="px-2 py-2">Manager</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Profile</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">
                      <a href={`/hrms/employees/${employee.id}`} className="font-semibold text-cyan-400 hover:underline block">
                        {employee.full_name}
                      </a>
                      <div className="text-xs text-[var(--ats-text-muted)] mt-0.5">
                        {employee.employee_code} · {employee.email}
                      </div>
                    </td>
                    <td className="px-2 py-2">{employee.department || "-"}</td>
                    <td className="px-2 py-2">{employee.designation || "-"}</td>
                    <td className="px-2 py-2">{employee.reporting_manager_name || "-"}</td>
                    <td className="px-2 py-2 capitalize">{employee.employment_status}</td>
                    <td className="px-2 py-2">
                      <span className="rounded-full border border-[var(--ats-border)] px-2 py-0.5 text-xs">
                        {employee.profile_completeness || 0}%
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <a href={`/hrms/employees/${employee.id}`} className={UI.primaryButton + " py-1.5 px-3 text-xs"}>
                          View 360
                        </a>
                        {canManage && <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => startEdit(employee)} disabled={busy}>
                          Edit
                        </button>}
                        {canManage && employee.employment_status === "active" ? (
                          <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void deactivate(employee.id)} disabled={busy}>
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      {employeesError ? "Employee directory unavailable." : !data ? "Loading employees…" : "No employees found."}
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

