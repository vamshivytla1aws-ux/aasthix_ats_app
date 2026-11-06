"use client";

import React from "react";
import useSWR, { useSWRConfig } from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

type Document = { id: number; file_name: string; category: string; expiry_date?: string | null };
const categories = ["offer_letter", "id_proof", "address_proof", "experience_letter", "education_certificate", "payslip", "policy_acknowledgement"];
export default function EmployeeDocumentsPanel({ employeeId, canManage }: { employeeId: number; canManage: boolean }) {
  const { mutate: refresh } = useSWRConfig();
  const { data, error, mutate } = useSWR<{ documents: Document[] }>(`/api/hrms/documents?employeeId=${employeeId}`, dashboardFetcher);
  const [file, setFile] = React.useState<File | null>(null), [category, setCategory] = React.useState("offer_letter"), [expiryDate, setExpiryDate] = React.useState("");
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  async function changed() { await mutate(); await refresh(`/api/hrms/employees/${employeeId}/setup`); }
  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.set("employeeId", String(employeeId)); body.set("category", category); body.set("file", file);
      if (expiryDate) body.set("expiryDate", expiryDate);
      await apiFetchJson("/api/hrms/documents", { method: "POST", body });
      setFile(null); setExpiryDate(""); if (input.current) input.current.value = "";
      await changed(); setMessage("Document uploaded.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  async function remove(document: Document) {
    if (!window.confirm(`Delete ${document.file_name} permanently?`)) return;
    setBusy(true); setMessage("");
    try { await apiFetchJson(`/api/hrms/documents/${document.id}`, { method: "DELETE" }); await changed(); setMessage("Document deleted."); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Unable to delete document."); }
    finally { setBusy(false); }
  }
  return <section className={UI.card + " p-5"}>
    <h2 className="font-semibold">Employee documents</h2>
    {canManage && <form onSubmit={upload} className="mt-4 grid items-end gap-3 sm:grid-cols-2">
      <label className={UI.label}>Document category<select className={UI.select} value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
      <label className={UI.label}>Choose document<input ref={input} className={UI.input} type="file" required onChange={event => setFile(event.target.files?.[0] || null)} /></label>
      <label className={UI.label}>Expiry date (optional)<input className={UI.input} type="date" value={expiryDate} onChange={event => setExpiryDate(event.target.value)} /></label>
      <button className={UI.primaryButton} type="submit" disabled={busy || !file}>Upload document</button>
    </form>}
    {error ? <p className="mt-4" role="alert">Unable to load employee documents.</p> : !data ? <p className="mt-4">Loading documents…</p> : <div className="mt-5 space-y-3">
      {(data.documents || []).map(document => <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ats-border)] pt-3" key={document.id}>
        <div><p className="font-medium">{document.file_name}</p><p className="text-sm capitalize text-[var(--ats-text-muted)]">{document.category.replaceAll("_", " ")}</p></div>
        <div className="flex gap-2"><a className={UI.secondaryButton} href={`/api/hrms/documents/${document.id}`}>Download</a>{canManage && <button className={UI.secondaryButton} type="button" disabled={busy} onClick={() => void remove(document)}>Delete</button>}</div>
      </div>)}
      {!data.documents?.length && <p className="text-sm text-[var(--ats-text-muted)]">No documents added yet.</p>}
    </div>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </section>;
}
