"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Download, RefreshCw } from "lucide-react";
import AccessGate from "@/components/AccessGate";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

type HealthPayload = {
  ready?: boolean;
  operation_status?: string;
  checks?: Record<string, unknown>;
  issues?: string[];
  hint?: string;
};
type MetricsPayload = { metrics?: Record<string, number> };

export default function CallHealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [healthResult, metricsResult] = await Promise.all([
        apiFetchJson<HealthPayload>("/api/chat/calls/health"),
        apiFetchJson<MetricsPayload>("/api/chat/calls/metrics"),
      ]);
      setHealth(healthResult);
      setMetrics(metricsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load call health");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function downloadBundle() {
    const blob = new Blob([JSON.stringify({ generated_at: new Date().toISOString(), health, metrics }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aasthix-call-health-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <AccessGate permissionKey="access_control.manage"><main className={UI.pageShell}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Link href="/admin/permissions" className="text-sm font-semibold text-[var(--ats-primary)]">Access Control</Link><h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Activity className="h-6 w-6" />Call Health</h1><p className="text-sm text-[var(--ats-text-muted)]">Redacted LiveKit, TURN expectation, schema, and recent media failure diagnostics.</p></div>
      <div className="flex gap-2"><button className={UI.secondaryButton} onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button><button className={UI.secondaryButton} onClick={downloadBundle} disabled={!health}><Download className="mr-2 inline h-4 w-4" />Download diagnostics</button></div>
    </div>
    {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
    <section className={`${UI.card} mt-4`}><div className="flex items-center justify-between"><h2 className="font-semibold">Readiness</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${health?.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{loading ? "Checking" : health?.ready ? "Ready" : "Needs attention"}</span></div><p className="mt-2 text-sm text-[var(--ats-text-muted)]">{health?.hint || "Loading LiveKit diagnostics..."}</p>{health?.issues?.length ? <div className="mt-3 flex flex-wrap gap-2">{health.issues.map((issue) => <span key={issue} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">{issue.replace(/_/g, " ")}</span>)}</div> : null}</section>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><section className={UI.card}><h2 className="font-semibold">Configuration checks</h2><pre className="mt-3 max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(health?.checks || {}, null, 2)}</pre></section><section className={UI.card}><h2 className="font-semibold">30-day reliability</h2><div className="mt-3 grid grid-cols-2 gap-3">{Object.entries(metrics?.metrics || {}).map(([key, value]) => <div key={key} className="rounded-xl border border-[var(--ats-border)] p-3"><div className="text-xs text-[var(--ats-text-muted)]">{key.replace(/_/g, " ")}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>)}</div></section></div>
  </main></AccessGate>;
}
