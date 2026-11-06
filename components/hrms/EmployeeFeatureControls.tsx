"use client";

import React from "react";
import { featurePermissionPatch } from "@/lib/hrms/employeeFeatures";
import { apiFetchJson } from "@/lib/apiClient";

export default function EmployeeFeatureControls({ employeeId, features, canManage, onUpdated }: {
  employeeId: number; features: Array<{ id: string; label: string; enabled: boolean }>; canManage: boolean; onUpdated: () => Promise<unknown>;
}) {
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState("");
  const [pending, setPending] = React.useState<{ id: string; enabled: boolean } | null>(null);
  async function change(id: string, enabled: boolean) {
    setBusy(true); setMessage(""); setPending({ id, enabled });
    try {
      await apiFetchJson("/api/admin/users-permissions", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: employeeId, permissions: featurePermissionPatch(id, enabled) }) });
      await onUpdated(); setMessage("Employee access updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update access."); }
    finally { setBusy(false); setPending(null); }
  }
  return <section aria-label="Employee feature access" className="mt-4">
    <h2 className="font-semibold">HRMS feature access</h2>
    <p className="mt-1 text-sm text-[var(--ats-text-muted)]">{canManage ? "Choose what this employee can use. Turning a feature off also blocks its self-service actions." : "The workspace owner manages these settings."}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {features.map(feature => <label key={feature.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ats-border)] p-3 text-sm">
        <span>{feature.label}</span><input type="checkbox" aria-label={`${feature.label} access`} checked={pending?.id === feature.id ? pending.enabled : feature.enabled} disabled={!canManage || busy} onChange={event => void change(feature.id, event.target.checked)} />
      </label>)}
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
