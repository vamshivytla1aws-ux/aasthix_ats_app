"use client";

import React from "react";
import useSWR, { useSWRConfig } from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

export default function EmployeeLoginSetup({ employeeId, expanded = false }: { employeeId: number; expanded?: boolean }) {
  const { mutate: refresh } = useSWRConfig();
  const { data: me } = useSWR<{ user: { role: string }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const allowed = me?.user.role !== "employee" && me?.permissions["employee_directory.manage"];
  const { data, error, mutate } = useSWR<{ email: string; loginReady: boolean; active: boolean; loginPath: string; joiningDate?: string | null }>(allowed ? `/api/hrms/employees/${employeeId}/login` : null, dashboardFetcher);
  const [joiningDate, setJoiningDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  React.useEffect(() => { setJoiningDate(data?.joiningDate || ""); }, [employeeId, data?.joiningDate]);
  React.useEffect(() => { setMessage(""); }, [employeeId]);
  if (!allowed) return null;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await apiFetchJson(`/api/hrms/employees/${employeeId}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joiningDate }) });
      await mutate(); await refresh("/api/hrms/employees"); setMessage("Password saved. The employee can sign in using their date of joining in DDMMYYYY format.");
      await refresh(`/api/hrms/employees/${employeeId}/setup`);
    } catch (err) { setMessage(err instanceof Error ? err.message : "Unable to set password."); }
    finally { setBusy(false); }
  }
  return <details open={expanded} className={UI.card + " p-5 mb-5"}>
    <summary className="cursor-pointer font-semibold">Employee login</summary>
    {error ? <p className="mt-3 text-sm">{error.message || "Login setup is unavailable for this account."}</p> : !data ? <p className="mt-3">Loading login details…</p> : <div className="mt-4 space-y-3 text-sm">
      <p>Email: <strong>{data.email}</strong></p>
      <p>Status: {data.active ? data.loginReady ? "Ready to sign in" : "Password not set" : "Employee access inactive"}</p>
      <p>Sign-in page: <a href={data.loginPath} className="text-teal-700 underline">Employee HRMS sign in</a></p>
      <p className="text-[var(--ats-text-muted)]">This login opens the employee&apos;s own HRMS. Access is controlled through the employee role and individual permissions.</p>
      <p>Password format: <strong>Date of joining as DDMMYYYY</strong> (for example, 13 May 2026 becomes 13052026).</p>
      {data.active && <form onSubmit={save} className="flex max-w-lg flex-wrap items-end gap-3">
        <label className={UI.label + " flex-1"}>Date of joining<input type="date" className={UI.input} required value={joiningDate} onChange={e => setJoiningDate(e.target.value)} /></label>
        <button type="submit" className={UI.primaryButton} disabled={busy}>{busy ? "Saving…" : data.loginReady ? "Reset password to joining date" : "Set joining date password"}</button>
      </form>}
      <p className="text-xs text-[var(--ats-text-muted)]">Saving a password signs out existing sessions for this employee. Share the credentials directly; this action does not send an email.</p>
    </div>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </details>;
}
