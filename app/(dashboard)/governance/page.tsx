"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import OperationResultBanner from "@/components/enterprise/OperationResultBanner";
import StatusBadge from "@/components/enterprise/StatusBadge";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import {
  AI_GOVERNANCE_V4_ENABLED,
  AI_GOVERNANCE_V4_FLAG_SOURCE,
  COMPLIANCE_V4_ENABLED,
  COMPLIANCE_V4_FLAG_SOURCE,
  INTEGRATIONS_V4_ENABLED,
  INTEGRATIONS_V4_FLAG_SOURCE,
  ORG_GOVERNANCE_V4_ENABLED,
  ORG_GOVERNANCE_V4_FLAG_SOURCE,
  SRE_HARDENING_V4_ENABLED,
  SRE_HARDENING_V4_FLAG_SOURCE,
} from "@/lib/featureFlags";
import { apiFetchJson } from "@/lib/apiClient";

type Tone = "success" | "partial" | "blocked" | "error" | "info";
type HealthStatus = "healthy" | "warning" | "blocked" | "error";
type HrmsSchemaDiagnostics = {
  status: "healthy" | "warning";
  missing_tables: string[];
  missing_columns: string[];
  checked_at: string;
  recommended_migrations: string[];
};

const EXPECTED_RETENTION = ["candidates", "jobs", "applications", "notes", "chat", "attendance", "timesheet"];

function deriveHealth(enabled: boolean, data: any): HealthStatus {
  if (!enabled) return "blocked";
  if (!data) return "warning";
  if (data?.error) return "error";
  const status = String(data?.health_status || "");
  if (status === "healthy" || status === "warning" || status === "blocked" || status === "error") return status;
  return "healthy";
}

export default function GovernancePage() {
  const [running, setRunning] = useState(false);
  const [runbookOpen, setRunbookOpen] = useState(false);
  const [globalPause, setGlobalPause] = useState(false);
  const [ruleFilter, setRuleFilter] = useState("");
  const [runFilter, setRunFilter] = useState("");
  const [result, setResult] = useState<{ tone: Tone; message: string; hint?: string } | null>(null);

  const { data: intel, mutate: mutateIntel } = useSWR("/api/intelligence/summary", dashboardFetcher);
  const { data: rules, mutate: mutateRules } = useSWR("/api/automation/rules", dashboardFetcher);
  const { data: runs, mutate: mutateRuns } = useSWR("/api/automation/runs?limit=20", dashboardFetcher);

  const { data: orgSettings, mutate: mutateOrgSettings } = useSWR("/api/org/settings", dashboardFetcher);
  const { data: workspaces, mutate: mutateWorkspaces } = useSWR("/api/org/workspaces", dashboardFetcher);
  const { data: accessPolicies, mutate: mutateAccessPolicies } = useSWR("/api/org/policies/access", dashboardFetcher);
  const { data: retention, mutate: mutateRetention } = useSWR("/api/org/policies/retention", dashboardFetcher);
  const { data: complianceReport } = useSWR("/api/compliance/report", dashboardFetcher);

  const { data: connectors, mutate: mutateConnectors } = useSWR("/api/integrations/connectors", dashboardFetcher);
  const { data: integrationRuns, mutate: mutateIntegrationRuns } = useSWR("/api/integrations/runs?limit=30", dashboardFetcher);
  const { data: sloMetrics, mutate: mutateSlo } = useSWR("/api/ops/health/slo", dashboardFetcher);
  const { data: queueStatus, mutate: mutateQueue } = useSWR("/api/ops/queue/status", dashboardFetcher);

  const { data: aiPolicies, mutate: mutateAiPolicies } = useSWR("/api/ai-governance/policies", dashboardFetcher);
  const { data: aiModels, mutate: mutateAiModels } = useSWR("/api/ai-governance/models", dashboardFetcher);
  const { data: aiAudit, mutate: mutateAiAudit } = useSWR("/api/ai-governance/audit?limit=40", dashboardFetcher);
  const { data: hrmsSchema, mutate: mutateHrmsSchema } = useSWR<{ diagnostics: HrmsSchemaDiagnostics; user_message?: string }>(
    "/api/hrms/diagnostics/schema",
    dashboardFetcher,
  );

  const workspaceRows = Array.isArray((workspaces as any)?.workspaces) ? (workspaces as any).workspaces : [];
  const accessRows = Array.isArray((accessPolicies as any)?.policies) ? (accessPolicies as any).policies : [];
  const retentionRows = Array.isArray((retention as any)?.policies) ? (retention as any).policies : [];
  const connectorRows = Array.isArray((connectors as any)?.connectors) ? (connectors as any).connectors : [];
  const integrationRunRows = Array.isArray((integrationRuns as any)?.runs) ? (integrationRuns as any).runs : [];
  const aiPolicyRows = Array.isArray((aiPolicies as any)?.policies) ? (aiPolicies as any).policies : [];
  const aiModelRows = Array.isArray((aiModels as any)?.models) ? (aiModels as any).models : [];
  const aiAuditRows = Array.isArray((aiAudit as any)?.records) ? (aiAudit as any).records : [];
  const automationRules = Array.isArray((rules as any)?.rules) ? (rules as any).rules : [];
  const automationRuns = Array.isArray((runs as any)?.runs) ? (runs as any).runs : [];
  const sloRows = Array.isArray((sloMetrics as any)?.metrics) ? (sloMetrics as any).metrics : [];

  const missingRetention = EXPECTED_RETENTION.filter(
    (entity) => !retentionRows.some((row: any) => String(row.entity_type || "").toLowerCase() === entity)
  );

  const health = useMemo(
    () => [
      { key: "org", label: "Org", status: deriveHealth(ORG_GOVERNANCE_V4_ENABLED, orgSettings), detail: `${workspaceRows.length} workspaces` },
      {
        key: "compliance",
        label: "Compliance",
        status: deriveHealth(COMPLIANCE_V4_ENABLED, complianceReport),
        detail: missingRetention.length ? `${missingRetention.length} missing entities` : "Coverage complete",
      },
      {
        key: "integrations",
        label: "Integrations",
        status: deriveHealth(INTEGRATIONS_V4_ENABLED, connectors),
        detail: `${connectorRows.length} connectors`,
      },
      { key: "sre", label: "SRE", status: deriveHealth(SRE_HARDENING_V4_ENABLED, sloMetrics), detail: `${sloRows.length} SLO metrics` },
      { key: "ai", label: "AI Governance", status: deriveHealth(AI_GOVERNANCE_V4_ENABLED, aiPolicies), detail: `${aiPolicyRows.length} policies` },
    ],
    [orgSettings, complianceReport, connectors, sloMetrics, aiPolicies, workspaceRows.length, missingRetention.length, connectorRows.length, sloRows.length, aiPolicyRows.length]
  );

  const actionQueue = useMemo(() => {
    const out: Array<{ key: string; severity: HealthStatus; text: string; href: string }> = [];
    if (missingRetention.length > 0) out.push({ key: "retention", severity: "warning", text: `Missing retention entities: ${missingRetention.join(", ")}`, href: "/governance" });
    if (connectorRows.some((row: any) => String(row.status || "").toLowerCase() === "failed")) out.push({ key: "connector", severity: "error", text: "Connector failure detected. Check integration health and replay runs.", href: "/governance" });
    if (integrationRunRows.some((row: any) => Boolean(row.dead_letter))) out.push({ key: "dlq", severity: "warning", text: "Dead-letter runs detected. Replay failed integration runs.", href: "/governance" });
    if (automationRules.length === 0) out.push({ key: "rules", severity: "warning", text: "No automation rules configured. Start with recommend-only rules.", href: "/pipeline" });
    if (aiPolicyRows.length === 0) out.push({ key: "ai-policy", severity: "warning", text: "No AI model policy configured. Pin approved models first.", href: "/governance" });
    return out.slice(0, 6);
  }, [missingRetention, connectorRows, integrationRunRows, automationRules.length, aiPolicyRows.length]);

  const filteredRules = useMemo(() => {
    const token = ruleFilter.trim().toLowerCase();
    return token ? automationRules.filter((rule: any) => JSON.stringify(rule).toLowerCase().includes(token)) : automationRules;
  }, [ruleFilter, automationRules]);

  const filteredRuns = useMemo(() => {
    const token = runFilter.trim().toLowerCase();
    return token ? automationRuns.filter((run: any) => JSON.stringify(run).toLowerCase().includes(token)) : automationRuns;
  }, [runFilter, automationRuns]);

  async function refreshAll() {
    await Promise.all([
      mutateIntel(),
      mutateRules(),
      mutateRuns(),
      mutateOrgSettings(),
      mutateWorkspaces(),
      mutateAccessPolicies(),
      mutateRetention(),
      mutateConnectors(),
      mutateIntegrationRuns(),
      mutateSlo(),
      mutateQueue(),
      mutateAiPolicies(),
      mutateAiModels(),
      mutateAiAudit(),
      mutateHrmsSchema(),
    ]);
  }

  async function runRecompute() {
    setRunning(true);
    try {
      const response = await apiFetchJson<{ operation_status?: Tone; user_message?: string; hint?: string }>("/api/intelligence/recompute", { method: "POST" });
      setResult({ tone: response.operation_status || "success", message: response.user_message || "Intelligence recompute completed.", hint: response.hint });
      await mutateRuns();
    } catch (error) {
      setResult({ tone: "error", message: "Recompute failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    } finally {
      setRunning(false);
    }
  }

  async function simulateAutomation() {
    try {
      const response = await apiFetchJson<{ operation_status?: Tone; user_message?: string; hint?: string }>("/api/automation/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: { stale_days: 7 } }),
      });
      setResult({ tone: response.operation_status || "success", message: response.user_message || "Automation simulation completed.", hint: response.hint });
      await mutateRuns();
    } catch (error) {
      setResult({ tone: "error", message: "Simulation failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    }
  }

  async function executeAutomation() {
    try {
      const response = await apiFetchJson<{ operation_status?: Tone; user_message?: string; hint?: string; error?: string }>("/api/automation/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow_execute: true, global_pause: globalPause }),
      });
      const message = response.error || response.user_message || "Automation execute request completed.";
      setResult({ tone: response.operation_status || "partial", message, hint: response.hint });
      await mutateRuns();
    } catch (error) {
      setResult({ tone: "error", message: "Execution failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    }
  }

  async function simulateRollback() {
    try {
      const response = await apiFetchJson<{ operation_status?: Tone; user_message?: string; hint?: string }>("/api/ops/rollback/simulate", { method: "POST" });
      setResult({ tone: response.operation_status || "success", message: response.user_message || "Rollback drill simulated.", hint: response.hint });
    } catch (error) {
      setResult({ tone: "error", message: "Rollback drill failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    }
  }

  async function recomputeDrift() {
    try {
      const response = await apiFetchJson<{ operation_status?: Tone; user_message?: string; hint?: string }>("/api/ai-governance/drift/recompute", { method: "POST" });
      setResult({ tone: response.operation_status || "success", message: response.user_message || "Drift recompute completed.", hint: response.hint });
      await mutateAiAudit();
    } catch (error) {
      setResult({ tone: "error", message: "Drift recompute failed.", hint: error instanceof Error ? error.message : "Unknown failure" });
    }
  }

  const tableClass = "mt-2 w-full min-w-[520px] text-xs";

  return (
    <AccessGate permissionKey="jobs.view">
      <ModulePageFrame
        title="AI Governance"
        subtitle="Enterprise control plane for trust, compliance, integrations, and reliability."
        metrics={
          <span>
            Org: {ORG_GOVERNANCE_V4_ENABLED ? "on" : "off"} | Compliance: {COMPLIANCE_V4_ENABLED ? "on" : "off"} | Integrations:{" "}
            {INTEGRATIONS_V4_ENABLED ? "on" : "off"} | SRE: {SRE_HARDENING_V4_ENABLED ? "on" : "off"} | AI: {AI_GOVERNANCE_V4_ENABLED ? "on" : "off"}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void refreshAll()}>
              Refresh all
            </button>
            <button type="button" className={UI.primaryButton + " py-2 text-xs"} disabled={running} onClick={() => void runRecompute()}>
              {running ? "Recomputing..." : "Recompute insights"}
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void simulateAutomation()}>
              Simulate automation
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void executeAutomation()}>
              Execute automation
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void simulateRollback()}>
              Rollback drill
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => void recomputeDrift()}>
              Recompute drift
            </button>
            <button type="button" className={UI.secondaryButton + " py-2 text-xs"} onClick={() => setRunbookOpen((prev) => !prev)}>
              {runbookOpen ? "Hide runbook" : "Show runbook"}
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

        <section className="mb-4 grid gap-3 md:grid-cols-5">
          {health.map((item) => (
            <div key={item.key} className={UI.enterprise.metricCard + " p-3"}>
              <div className="text-xs uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">{item.label}</div>
              <div className="mt-2">
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-2 text-xs text-[var(--ats-text-muted)]">{item.detail}</div>
            </div>
          ))}
        </section>

        <section className={UI.enterprise.elevatedCard + " mb-4 p-4"}>
          <div className="text-sm font-semibold text-[var(--ats-text)]">Flag source panel</div>
          <div className="mt-2 grid gap-2 text-xs text-[var(--ats-text-muted)] sm:grid-cols-2 lg:grid-cols-3">
            <div>Org source: {ORG_GOVERNANCE_V4_FLAG_SOURCE}</div>
            <div>Compliance source: {COMPLIANCE_V4_FLAG_SOURCE}</div>
            <div>Integrations source: {INTEGRATIONS_V4_FLAG_SOURCE}</div>
            <div>SRE source: {SRE_HARDENING_V4_FLAG_SOURCE}</div>
            <div>AI source: {AI_GOVERNANCE_V4_FLAG_SOURCE}</div>
            <div>Last refresh: {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</div>
          </div>
        </section>

        {runbookOpen ? (
          <section className={UI.enterprise.elevatedCard + " mb-4 p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Runbook</div>
            <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
              Enable sequence: Org to Compliance to Integrations to SRE to AI Governance. Rollback sequence: disable in reverse order.
            </div>
            <div className="mt-1 text-xs text-[var(--ats-text-muted)]">
              Common failures: Google scopes, sparse data windows, permission mismatch.
            </div>
            <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
              Quick links:{" "}
              <Link href="/team-calendar" className="underline underline-offset-2">
                Team Calendar
              </Link>{" "}
              |{" "}
              <Link href="/pipeline" className="underline underline-offset-2">
                Pipeline
              </Link>{" "}
              |{" "}
              <Link href="/interviews" className="underline underline-offset-2">
                Interviews
              </Link>{" "}
              |{" "}
              <Link href="/candidates" className="underline underline-offset-2">
                Candidates
              </Link>
            </div>
          </section>
        ) : null}

        <section className={UI.enterprise.elevatedCard + " mb-4 p-4"}>
          <div className="mb-2 text-sm font-semibold text-[var(--ats-text)]">Action queue</div>
          {actionQueue.length === 0 ? (
            <div className="text-xs text-[var(--ats-text-muted)]">No unresolved governance issues.</div>
          ) : (
            <div className="space-y-2">
              {actionQueue.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--ats-border)] p-2">
                  <div className="text-xs text-[var(--ats-text)]">
                    <StatusBadge status={item.severity} /> <span className="ml-2">{item.text}</span>
                  </div>
                  <Link href={item.href} className="text-xs font-semibold text-[var(--ats-brand)] underline underline-offset-2">
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {hrmsSchema?.diagnostics?.status === "warning" ? (
          <section className={UI.enterprise.elevatedCard + " mb-4 p-4"}>
            <div className="text-sm font-semibold text-amber-900">HRMS schema warning</div>
            <div className="mt-1 text-xs text-amber-800">
              Missing schema objects detected. HRMS fallbacks are active, but migrations should be applied.
            </div>
            <div className="mt-2 text-xs text-[var(--ats-text)]">
              Missing columns: {hrmsSchema.diagnostics.missing_columns.join(", ") || "None"}
            </div>
            <div className="mt-1 text-xs text-[var(--ats-text)]">
              Missing tables: {hrmsSchema.diagnostics.missing_tables.join(", ") || "None"}
            </div>
            {hrmsSchema.diagnostics.recommended_migrations.length ? (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {hrmsSchema.diagnostics.recommended_migrations.join(" | ")}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Workspace matrix</div>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className={UI.enterprise.tableHeaderSticky}>
                  <tr className="text-left uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">
                    <th className="px-2 py-2">Workspace</th>
                    <th className="px-2 py-2">BU</th>
                    <th className="px-2 py-2">Active</th>
                    <th className="px-2 py-2">Policy</th>
                    <th className="px-2 py-2">Boundary</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaceRows.map((row: any) => (
                    <tr key={row.id} className={UI.enterprise.tableRow}>
                      <td className="px-2 py-2">{row.workspace_name}</td>
                      <td className="px-2 py-2">{row.business_unit}</td>
                      <td className="px-2 py-2">{row.active ? "Yes" : "No"}</td>
                      <td className="px-2 py-2">{accessRows.length > 0 ? "Configured" : "Pending"}</td>
                      <td className="px-2 py-2">{row.active ? "Pass" : "Review"}</td>
                    </tr>
                  ))}
                  {workspaceRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                        No workspaces found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Compliance and boundary checks</div>
            {missingRetention.length > 0 ? (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Non-compliant entities: {missingRetention.join(", ")}
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                Retention coverage complete.
              </div>
            )}
            <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(complianceReport ?? {}, null, 2)}
            </pre>
          </section>

          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Integration and SRE visibility</div>
            <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
              Readiness:{" "}
              {connectorRows.some((row: any) => String(row.status || "").toLowerCase() === "failed")
                ? "RED"
                : sloRows.some((row: any) => String(row.status || "").toLowerCase() === "critical")
                  ? "YELLOW"
                  : "GREEN"}
            </div>
            <div className="mt-2 text-xs text-[var(--ats-text-muted)]">
              Connectors: {connectorRows.length} | Runs: {integrationRunRows.length} | Queue failed: {(queueStatus as any)?.queue?.failed ?? 0}
            </div>
            <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify({ connectors: connectorRows.slice(0, 8), slo: sloRows.slice(0, 8) }, null, 2)}
            </pre>
          </section>

          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">AI governance explorer</div>
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify({ policies: aiPolicyRows, models: aiModelRows, audit: aiAuditRows.slice(0, 20) }, null, 2)}
            </pre>
          </section>

          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Automation rules</div>
            <input
              value={ruleFilter}
              onChange={(event) => setRuleFilter(event.target.value)}
              placeholder="Filter rules"
              className="mt-2 w-full rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2 text-xs text-[var(--ats-text)]"
            />
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(filteredRules, null, 2)}
            </pre>
          </section>

          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Automation runs</div>
            <input
              value={runFilter}
              onChange={(event) => setRunFilter(event.target.value)}
              placeholder="Filter runs"
              className="mt-2 w-full rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2 text-xs text-[var(--ats-text)]"
            />
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(filteredRuns, null, 2)}
            </pre>
          </section>
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}
