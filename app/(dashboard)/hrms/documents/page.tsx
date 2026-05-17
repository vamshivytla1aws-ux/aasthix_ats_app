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
};

export default function EmployeeDocumentsPage() {
  const [employeeId, setEmployeeId] = React.useState("");
  const [category, setCategory] = React.useState(CATEGORIES[0].value);
  const [file, setFile] = React.useState<File | null>(null);
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const employeesSwr = useSWR<{ employees: Employee[] }>("/api/hrms/employees", dashboardFetcher, { revalidateOnFocus: false });
  const docsSwr = useSWR<{ documents: DocumentRow[] }>("/api/hrms/documents", dashboardFetcher, { revalidateOnFocus: false });

  async function upload() {
    if (!employeeId) return setToast({ message: "Select an employee.", variant: "blocked" });
    if (!file) return setToast({ message: "Choose a file.", variant: "blocked" });
    setBusy(true);
    try {
      const form = new FormData();
      form.set("employeeId", employeeId);
      form.set("category", category);
      form.set("file", file);
      await apiFetchJson("/api/hrms/documents", { method: "POST", body: form });
      setFile(null);
      setToast({ message: "Document uploaded.", variant: "success" });
      await docsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to upload.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await apiFetchJson(`/api/hrms/documents/${id}`, { method: "DELETE" });
      setToast({ message: "Document deleted.", variant: "success" });
      await docsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to delete document.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const documents = docsSwr.data?.documents || [];

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
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} disabled={busy} onClick={() => void upload()}>
              Upload
            </button>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Documents</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">File</th>
                  <th className="px-2 py-2">Uploaded</th>
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
                    <td colSpan={5} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
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
