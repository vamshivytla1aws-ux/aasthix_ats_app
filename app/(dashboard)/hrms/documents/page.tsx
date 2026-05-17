"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { UI } from "@/lib/ui";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";

const CATEGORIES = [
  { value: "offer_letter", label: "Offer letter" },
  { value: "id_proof", label: "Aadhaar/PAN/ID proof" },
  { value: "address_proof", label: "Address proof" },
  { value: "experience_letter", label: "Experience letter" },
  { value: "education_certificate", label: "Education certificate" },
  { value: "payslip", label: "Payslip" },
  { value: "policy_acknowledgement", label: "Company policy acknowledgement" },
] as const;

type Employee = { id: number; full_name: string; email: string };
type DocumentRow = {
  id: number;
  user_id: number;
  category: string;
  file_name: string;
  file_type: string;
  file_size: number;
  employee_name: string;
  uploaded_by_name: string;
  uploaded_at: string;
  expiry_date?: string | null;
};
type DocumentPolicy = {
  id?: number;
  category: string;
  department?: string | null;
  employment_type?: string | null;
  is_mandatory: boolean;
  expiry_days?: number | null;
  is_active: boolean;
};
type ComplianceResult = {
  employee_id: number;
  employee_name: string;
  mandatory_categories: string[];
  missing: string[];
  expiring_soon: Array<{ category: string; file_name: string; expiry_date: string }>;
  compliant: boolean;
};

type OperationFeedback = {
  operation_status?: "success" | "partial" | "blocked" | "error";
  user_message?: string;
};

export default function EmployeeDocumentsPage() {
  const [employeeId, setEmployeeId] = React.useState("");
  const [category, setCategory] = React.useState<string>(CATEGORIES[0].value);
  const [file, setFile] = React.useState<File | null>(null);
  const [expiryDate, setExpiryDate] = React.useState("");
  const [policyCategory, setPolicyCategory] = React.useState<string>(CATEGORIES[0].value);
  const [policyMandatory, setPolicyMandatory] = React.useState(true);
  const [policyExpiryDays, setPolicyExpiryDays] = React.useState("");
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const employeesSwr = useSWR<{ employees: Employee[] }>("/api/hrms/employees", dashboardFetcher, { revalidateOnFocus: false });
  const docsSwr = useSWR<{ documents: DocumentRow[] }>("/api/hrms/documents", dashboardFetcher, { revalidateOnFocus: false });
  const complianceSwr = useSWR<{ compliance: ComplianceResult }>(
    employeeId ? `/api/hrms/documents/compliance?employeeId=${employeeId}` : null,
    dashboardFetcher,
    { revalidateOnFocus: false },
  );
  const policiesSwr = useSWR<{ policies: DocumentPolicy[] }>("/api/hrms/documents/policies", dashboardFetcher, {
    revalidateOnFocus: false,
  });

  async function upload() {
    if (!employeeId) return setToast({ message: "Select an employee.", variant: "blocked" });
    if (!file) return setToast({ message: "Choose a file.", variant: "blocked" });
    setBusy(true);
    try {
      const form = new FormData();
      form.set("employeeId", employeeId);
      form.set("category", category);
      form.set("file", file);
      if (expiryDate) form.set("expiryDate", expiryDate);
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/documents", { method: "POST", body: form });
      setFile(null);
      setExpiryDate("");
      setToast({
        message: response.user_message || "Document uploaded.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await docsSwr.mutate();
      await complianceSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to upload.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>(`/api/hrms/documents/${id}`, { method: "DELETE" });
      setToast({
        message: response.user_message || "Document deleted.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      await docsSwr.mutate();
      await complianceSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to delete document.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const documents = docsSwr.data?.documents || [];
  const compliance = complianceSwr.data?.compliance || null;
  const policies = policiesSwr.data?.policies || [];

  async function savePolicy() {
    setBusy(true);
    try {
      const next = [
        ...policies,
        {
          category: policyCategory,
          department: null,
          employment_type: null,
          is_mandatory: policyMandatory,
          expiry_days: policyExpiryDays ? Number(policyExpiryDays) : null,
          is_active: true,
        },
      ];
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/documents/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policies: next.map((policy) => ({
            category: policy.category,
            department: policy.department || null,
            employmentType: policy.employment_type || null,
            isMandatory: Boolean(policy.is_mandatory),
            expiryDays: policy.expiry_days ?? null,
            isActive: Boolean(policy.is_active),
          })),
        }),
      });
      setToast({
        message: response.user_message || "Document policy saved.",
        variant: response.operation_status === "blocked" ? "blocked" : response.operation_status === "error" ? "error" : "success",
      });
      setPolicyExpiryDays("");
      await policiesSwr.mutate();
      await complianceSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save policy.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessGate permissionKey="documents.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Document Management" subtitle="Secure employee document vault with role-scoped visibility and downloads.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Upload document</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className={UI.select} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select employee</option>
              {(employeesSwr.data?.employees || []).map((employee) => (
                <option key={employee.id} value={String(employee.id)}>
                  {employee.full_name} ({employee.email})
                </option>
              ))}
            </select>
            <select className={UI.select} value={category} onChange={(e) => setCategory(e.target.value as any)}>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input className={UI.input} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <input className={UI.input} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} disabled={busy} onClick={() => void upload()}>
              Upload
            </button>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Compliance checklist</h2>
          {compliance ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--ats-border)] p-3 text-sm">
                <div className="font-semibold text-[var(--ats-text)]">Missing mandatory docs</div>
                {compliance.missing.length ? (
                  <ul className="mt-2 list-disc pl-4 text-[var(--ats-text-muted)]">
                    {compliance.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-[var(--ats-text-muted)]">No missing mandatory documents.</div>
                )}
              </div>
              <div className="rounded-lg border border-[var(--ats-border)] p-3 text-sm">
                <div className="font-semibold text-[var(--ats-text)]">Expiring in 30 days</div>
                {compliance.expiring_soon.length ? (
                  <ul className="mt-2 list-disc pl-4 text-[var(--ats-text-muted)]">
                    {compliance.expiring_soon.map((row) => (
                      <li key={`${row.category}-${row.file_name}`}>
                        {row.category}: {row.file_name} ({row.expiry_date})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-[var(--ats-text-muted)]">No upcoming expiries.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-[var(--ats-text-muted)]">Select an employee to view compliance.</div>
          )}
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Mandatory document policy</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className={UI.select} value={policyCategory} onChange={(e) => setPolicyCategory(e.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              className={UI.input}
              type="number"
              min={0}
              placeholder="Expiry days (optional)"
              value={policyExpiryDays}
              onChange={(e) => setPolicyExpiryDays(e.target.value)}
            />
            <label className={UI.label + " flex items-center gap-2"}>
              <input type="checkbox" checked={policyMandatory} onChange={(e) => setPolicyMandatory(e.target.checked)} />
              Mandatory
            </label>
            <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={() => void savePolicy()} disabled={busy}>
              Add policy rule
            </button>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Documents</h2>
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
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">File</th>
                  <th className="px-2 py-2">Uploaded</th>
                  <th className="px-2 py-2">Expiry</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{doc.employee_name}</td>
                    <td className="px-2 py-2">{doc.category}</td>
                    <td className="px-2 py-2">{doc.file_name}</td>
                    <td className="px-2 py-2">{new Date(doc.uploaded_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                    <td className="px-2 py-2">{doc.expiry_date ? String(doc.expiry_date).slice(0, 10) : "-"}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <a className={UI.secondaryButton + " py-1.5 text-xs"} href={`/api/hrms/documents/${doc.id}`}>
                          Download
                        </a>
                        <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void remove(doc.id)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No documents found.
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
