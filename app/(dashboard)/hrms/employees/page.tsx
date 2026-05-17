"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

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
  const [q, setQ] = React.useState("");
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);
  const [importRows, setImportRows] = React.useState<EmployeeImportRowResult[]>([]);
  const [importSummary, setImportSummary] = React.useState<{ valid: number; invalid: number; conflict: number } | null>(null);

  const { data, mutate } = useSWR<{ employees: Employee[] }>(`/api/hrms/employees?q=${encodeURIComponent(q)}`, dashboardFetcher, {
    revalidateOnFocus: false,
  });

  const employees = data?.employees || [];

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(employee: Employee) {
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
  }

  async function submitForm() {
    if (!form.employeeIdCode.trim() || !form.fullName.trim() || !form.email.trim()) {
      setToast({ message: "Employee ID, full name, and email are required.", variant: "blocked" });
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
            reportingManagerEmail: form.reportingManagerEmail.trim() || null,
          }),
        });
      } else {
        await apiFetchJson("/api/hrms/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            reportingManagerEmail: form.reportingManagerEmail.trim() || null,
          }),
        });
      }
      setToast({ message: editingId ? "Employee updated." : "Employee created.", variant: "success" });
      resetForm();
      await mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save employee.", variant: "error" });
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
    <AccessGate permissionKey="employee_directory.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Employee Directory" subtitle="Add, update, search, and manage employee lifecycle status.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">{editingId ? "Edit employee" : "Add employee"}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input className={UI.input} placeholder="Employee ID" value={form.employeeIdCode} onChange={(e) => setForm((s) => ({ ...s, employeeIdCode: e.target.value }))} />
            <input className={UI.input} placeholder="Full name" value={form.fullName} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} />
            <input className={UI.input} placeholder="Email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            <input className={UI.input} placeholder="Phone" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
            <input className={UI.input} placeholder="Department" value={form.department} onChange={(e) => setForm((s) => ({ ...s, department: e.target.value }))} />
            <input className={UI.input} placeholder="Designation" value={form.designation} onChange={(e) => setForm((s) => ({ ...s, designation: e.target.value }))} />
            <input className={UI.input} placeholder="Employment type" value={form.employmentType} onChange={(e) => setForm((s) => ({ ...s, employmentType: e.target.value }))} />
            <input className={UI.input} placeholder="Joining date" type="date" value={form.joiningDate} onChange={(e) => setForm((s) => ({ ...s, joiningDate: e.target.value }))} />
            <input className={UI.input} placeholder="Work location" value={form.workLocation} onChange={(e) => setForm((s) => ({ ...s, workLocation: e.target.value }))} />
            <select className={UI.select} value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
            </select>
            <select className={UI.select} value={form.role} onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="recruiter">Recruiter</option>
              <option value="hr">HR</option>
            </select>
            <input
              className={UI.input}
              placeholder="Reporting manager / director email (optional, assign later)"
              value={form.reportingManagerEmail}
              onChange={(e) => setForm((s) => ({ ...s, reportingManagerEmail: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void submitForm()} disabled={busy}>
              {editingId ? "Update employee" : "Add employee"}
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={resetForm} disabled={busy}>
              Reset
            </button>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
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
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Employees</h2>
            <input className={UI.input + " w-full sm:w-72"} placeholder="Search by name, email, phone, employee ID..." value={q} onChange={(e) => setQ(e.target.value)} />
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
                      <div className="font-semibold text-[var(--ats-text)]">{employee.full_name}</div>
                      <div className="text-xs text-[var(--ats-text-muted)]">
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
                        <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => startEdit(employee)}>
                          Edit
                        </button>
                        {employee.employment_status === "active" ? (
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
                      No employees found.
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
