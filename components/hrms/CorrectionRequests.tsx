"use client";

import React from "react";
import useSWR from "swr";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { CORRECTION_FIELDS, type CorrectionCategory, type CorrectionRequest } from "@/lib/hrms/corrections";
import { UI } from "@/lib/ui";

const titles = { profile: "Profile corrections", salary: "Salary setup corrections", payslip: "Payslip corrections" };
const statuses = { pending: "Pending", resolved: "Resolved", declined: "Declined" };
const endpoint = "/api/hrms/correction-requests";

export default function CorrectionRequests({ category, employeeId, canClose = false, payslipMonths = [] }: {
  category: CorrectionCategory; employeeId?: number; canClose?: boolean; payslipMonths?: string[];
}) {
  const self = employeeId == null;
  const { data, error, mutate } = useSWR<{ requests: CorrectionRequest[] }>(
    `${endpoint}?category=${category}${self ? "" : `&employeeId=${employeeId}`}`, dashboardFetcher);
  const [creating, setCreating] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [closing, setClosing] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState<"resolved" | "declined">("resolved");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [failure, setFailure] = React.useState("");
  const options = category === "payslip" ? payslipMonths : CORRECTION_FIELDS[category];

  async function submit() {
    setBusy(true); setFailure(""); setMessage("");
    try {
      await apiFetchJson(endpoint, {
        method: self ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(self ? { category, subject, description } : { category, employeeId, id: closing, status, note }),
      });
      setCreating(false); setSubject(""); setDescription(""); setClosing(null); setNote("");
      setMessage(self ? "Request sent to HR." : "Request closed.");
      await mutate();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Unable to save the request.");
      await mutate();
    } finally { setBusy(false); }
  }

  return <section className={UI.card + " mt-4 p-4 sm:p-5"} aria-label={titles[category]}>
    <h2 className="font-semibold">{titles[category]}</h2>
    {error ? <p role="alert" className="mt-2 text-sm">Unable to load correction requests.</p>
      : !data ? <p className="mt-2 text-sm">Loading requests…</p>
      : !data.requests?.length ? <p className="mt-2 text-sm text-[var(--ats-text-muted)]">No correction requests.</p> : null}
    {data?.requests?.map(row => <article key={row.id} className={UI.sectionCard + " mt-3 p-3 text-sm"}>
      <h3 className="font-semibold">{row.subject} · {statuses[row.status]}</h3>
      <p className="mt-1 whitespace-pre-wrap break-words">{row.description}</p>
      {row.resolution_note && <p className="mt-2 whitespace-pre-wrap break-words">HR note · {row.resolution_note}</p>}
      {canClose && row.status === "pending" && closing !== row.id &&
        <button type="button" className={UI.secondaryButton + " mt-2"} disabled={busy} onClick={() => {
          setClosing(row.id); setStatus("resolved"); setNote(""); setFailure("");
        }}>Close request</button>}
      {closing === row.id && row.status === "pending" && <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <p>Make any changes in the employee editor before closing the request.</p>
        <label className={UI.label}>Outcome<select className={UI.select} value={status} disabled={busy} onChange={event => setStatus(event.target.value as typeof status)}>
          <option value="resolved">Resolved</option><option value="declined">Declined</option>
        </select></label>
        <label className={UI.label}>Closing note<textarea className={UI.input} value={note} required maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          <button className={UI.primaryButton} disabled={busy || !note.trim()}>Save outcome</button>
          <button type="button" className={UI.secondaryButton} disabled={busy} onClick={() => setClosing(null)}>Cancel</button>
        </div>
      </form>}
    </article>)}
    {self && options.length > 0 && !creating && <button type="button" className={UI.secondaryButton + " mt-3"} onClick={() => setCreating(true)}>Request a correction</button>}
    {creating && <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className={UI.label}>{category === "payslip" ? "Payslip month" : "Field"}
        <select className={UI.select} value={subject} required disabled={busy} onChange={event => setSubject(event.target.value)}>
          <option value="">Choose one</option>{options.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className={UI.label}>What needs to change?
        <textarea className={UI.input} value={description} required maxLength={1000} disabled={busy} onChange={event => setDescription(event.target.value)} />
      </label>
      <p className="text-xs text-[var(--ats-text-muted)]">Keep bank and tax identification numbers out of the description.</p>
      <div className="flex flex-wrap gap-2">
        <button className={UI.primaryButton} disabled={busy || !subject || !description.trim()}>Send to HR</button>
        <button type="button" className={UI.secondaryButton} disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
      </div>
    </form>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {failure && <p role="alert" className="mt-3 text-sm text-red-700">{failure}</p>}
  </section>;
}
