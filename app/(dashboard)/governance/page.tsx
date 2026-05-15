"use client";

import React, { useState } from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import OperationResultBanner from "@/components/enterprise/OperationResultBanner";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { AUTOMATION_V3_ENABLED, CALIBRATION_V3_ENABLED, FORECAST_V3_ENABLED, INTELLIGENCE_V3_ENABLED } from "@/lib/featureFlags";
import {
  AI_GOVERNANCE_V4_ENABLED,
  AI_GOVERNANCE_V4_FLAG_SOURCE,
  COMPLIANCE_V4_ENABLED,
  COMPLIANCE_V4_FLAG_SOURCE,
  INTEGRATIONS_V4_ENABLED,
  INTEGRATIONS_V4_FLAG_SOURCE,
  ORG_GOVERNANCE_V4_FLAG_SOURCE,
  ORG_GOVERNANCE_V4_ENABLED,
  SRE_HARDENING_V4_FLAG_SOURCE,
  SRE_HARDENING_V4_ENABLED,
} from "@/lib/featureFlags";
import { apiFetchJson } from "@/lib/apiClient";

export default function GovernancePage() {
  const [running, setRunning] = useState(false);
  const [globalPause, setGlobalPause] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "partial" | "blocked" | "error" | "info"; message: string; hint?: string } | null>(null);
  const [runFilter, setRunFilter] = useState("");
  const [rulesFilter, setRulesFilter] = useState("");
  const { data: intel } = useSWR<{ enabled?: boolean; resolved_from?: string; summary?: unknown; message?: string }>(
    "/api/intelligence/summary",
    dashboardFetcher
  );
  const { data: rules, mutate: mutateRules } = useSWR("/api/automation/rules", dashboardFetcher);
  const { data: runs, mutate: mutateRuns } = useSWR("/api/automation/runs?limit=20", dashboardFetcher);
  const { data: orgSettings } = useSWR("/api/org/settings", dashboardFetcher);
  const { data: retention } = useSWR("/api/org/policies/retention", dashboardFetcher);
  const { data: connectors } = useSWR("/api/integrations/connectors", dashboardFetcher);
  const { data: sloMetrics } = useSWR("/api/ops/health/slo", dashboardFetcher);
  const { data: aiPolicies } = useSWR("/api/ai-governance/policies", dashboardFetcher);

  async function runRecompute() {
    setRunning(true);
    try {
      await apiFetchJson("/api/intelligence/recompute", { method: "POST" });
      setResult({ tone: "success", message: "Intelligence recompute completed.", hint: "Risk scores were refreshed from latest board data." });
      await mutateRuns();
    } catch (error) {
      setResult({ tone: "error", message: "Recompute failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    } finally {
      setRunning(false);
    }
  }

  async function simulateAutomation() {
    try {
      await apiFetchJson("/api/automation/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: { stale_days: 7 } }),
      });
      setResult({ tone: "success", message: "Automation simulation completed.", hint: "Recommend-only run logs were generated." });
      await mutateRuns();
    } catch (error) {
      setResult({ tone: "error", message: "Simulation failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    }
  }

  async function executeAutomation() {
    try {
      const payload = await apiFetchJson<{ runs?: unknown[]; operation_status?: string; error?: string }>("/api/automation/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow_execute: true, global_pause: globalPause }),
      });
      if (payload.operation_status === "blocked") {
        setResult({ tone: "blocked", message: payload.error || "Automation execution blocked by policy." });
      } else {
        setResult({ tone: "partial", message: "Automation execute request completed.", hint: "Rules not in auto-execute mode were safely skipped." });
      }
      await mutateRuns();
    } catch (error) {
      setResult({ tone: "error", message: "Execution failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    }
  }

  const filteredRuns = Array.isArray((runs as any)?.runs)
    ? ((runs as any).runs as Array<Record<string, unknown>>).filter((run) => {
        const token = runFilter.trim().toLowerCase();
        if (!token) return true;
        return JSON.stringify(run).toLowerCase().includes(token);
      })
    : [];

  const filteredRules = Array.isArray((rules as any)?.rules)
    ? ((rules as any).rules as Array<Record<string, unknown>>).filter((rule) => {
        const token = rulesFilter.trim().toLowerCase();
        if (!token) return true;
        return JSON.stringify(rule).toLowerCase().includes(token);
      })
    : [];

  return (
    <AccessGate permissionKey="jobs.view">
      <ModulePageFrame
        title="AI Governance"
        subtitle="Model health, automation controls, and operational trust posture."
        metrics={
          <span>
            Flags: {(intel?.enabled ?? INTELLIGENCE_V3_ENABLED) ? "Intelligence on" : "Intelligence off"} ·{" "}
            {AUTOMATION_V3_ENABLED ? "Automation on" : "Automation off"} ·{" "}
            {FORECAST_V3_ENABLED ? "Forecast on" : "Forecast off"} ·{" "}
            {CALIBRATION_V3_ENABLED ? "Calibration on" : "Calibration off"} ·{" "}
            {ORG_GOVERNANCE_V4_ENABLED ? "Org V4 on" : "Org V4 off"} ·{" "}
            {COMPLIANCE_V4_ENABLED ? "Compliance V4 on" : "Compliance V4 off"} ·{" "}
            {INTEGRATIONS_V4_ENABLED ? "Integrations V4 on" : "Integrations V4 off"} ·{" "}
            {SRE_HARDENING_V4_ENABLED ? "SRE V4 on" : "SRE V4 off"} ·{" "}
            {AI_GOVERNANCE_V4_ENABLED ? "AI Gov V4 on" : "AI Gov V4 off"}
            {intel?.resolved_from ? ` · Intelligence source: ${intel.resolved_from}` : ""}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void mutateRules()}>
              Refresh rules
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void mutateRuns()}>
              Refresh runs
            </button>
            <button
              type="button"
              className={UI.primaryButton + " py-2 text-xs"}
              disabled={!(intel?.enabled ?? INTELLIGENCE_V3_ENABLED) || running}
              onClick={() => void runRecompute()}
            >
              {running ? "Recomputing..." : "Recompute insights"}
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void simulateAutomation()}>
              Simulate automation
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void executeAutomation()}>
              Execute automation
            </button>
            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--ats-border)] px-2 py-1.5 text-xs text-[var(--ats-text-muted)]">
              <input type="checkbox" checked={globalPause} onChange={(event) => setGlobalPause(event.target.checked)} />
              Global automation pause
            </label>
          </div>
        }
      >
        {result ? (
          <OperationResultBanner
            tone={result.tone}
            message={result.message}
            hint={result.hint}
            action={
              <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={() => setResult(null)}>
                Dismiss
              </button>
            }
          />
        ) : null}
        <section className={UI.enterprise.elevatedCard + " mb-4 p-4"}>
          <div className="text-sm font-semibold text-[var(--ats-text)]">Phase 3 runbook</div>
          <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
            Enable sequence: Intelligence → Automation (recommend-only) → Forecast → Calibration. Rollback sequence: disable in reverse order.
            Common failures: Google scopes, sparse data windows, permission mismatch.
          </div>
        </section>
        <section className={UI.enterprise.elevatedCard + " mb-4 p-4"}>
          <div className="text-sm font-semibold text-[var(--ats-text)]">Phase 4 flag sources</div>
          <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
            Org governance: {ORG_GOVERNANCE_V4_FLAG_SOURCE} · Compliance: {COMPLIANCE_V4_FLAG_SOURCE} · Integrations:{" "}
            {INTEGRATIONS_V4_FLAG_SOURCE} · SRE: {SRE_HARDENING_V4_FLAG_SOURCE} · AI governance: {AI_GOVERNANCE_V4_FLAG_SOURCE}
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Intelligence summary</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(intel ?? { message: "No intelligence data yet" }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Automation rules</div>
            <input
              value={rulesFilter}
              onChange={(event) => setRulesFilter(event.target.value)}
              placeholder="Filter rules"
              className="mt-2 w-full rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2 text-xs text-[var(--ats-text)]"
            />
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify({ ...(rules as Record<string, unknown>), rules: filteredRules }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4 md:col-span-2"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Recent automation runs</div>
            <input
              value={runFilter}
              onChange={(event) => setRunFilter(event.target.value)}
              placeholder="Filter runs"
              className="mt-2 w-full rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2 text-xs text-[var(--ats-text)]"
            />
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify({ ...(runs as Record<string, unknown>), runs: filteredRuns }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Org settings (Phase 4)</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(orgSettings ?? { message: "No org settings payload" }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Retention policies</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(retention ?? { message: "No retention policies" }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Integration connectors</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(connectors ?? { message: "No connectors configured" }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">SLO metrics</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(sloMetrics ?? { message: "No SLO metrics yet" }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4 md:col-span-2"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">AI governance policies</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(aiPolicies ?? { message: "No AI governance policies configured" }, null, 2)}
            </pre>
          </section>
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}
