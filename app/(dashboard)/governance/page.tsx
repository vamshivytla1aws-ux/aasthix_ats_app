"use client";

import React, { useState } from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { AUTOMATION_V3_ENABLED, CALIBRATION_V3_ENABLED, FORECAST_V3_ENABLED, INTELLIGENCE_V3_ENABLED } from "@/lib/featureFlags";
import {
  AI_GOVERNANCE_V4_ENABLED,
  COMPLIANCE_V4_ENABLED,
  INTEGRATIONS_V4_ENABLED,
  ORG_GOVERNANCE_V4_ENABLED,
  SRE_HARDENING_V4_ENABLED,
} from "@/lib/featureFlags";
import { apiFetchJson } from "@/lib/apiClient";

export default function GovernancePage() {
  const [running, setRunning] = useState(false);
  const { data: intel } = useSWR("/api/intelligence/summary", dashboardFetcher);
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
      await mutateRuns();
    } catch {
      // noop
    } finally {
      setRunning(false);
    }
  }

  return (
    <AccessGate permissionKey="jobs.view">
      <ModulePageFrame
        title="AI Governance"
        subtitle="Model health, automation controls, and operational trust posture."
        metrics={
          <span>
            Flags: {INTELLIGENCE_V3_ENABLED ? "Intelligence on" : "Intelligence off"} ·{" "}
            {AUTOMATION_V3_ENABLED ? "Automation on" : "Automation off"} ·{" "}
            {FORECAST_V3_ENABLED ? "Forecast on" : "Forecast off"} ·{" "}
            {CALIBRATION_V3_ENABLED ? "Calibration on" : "Calibration off"} ·{" "}
            {ORG_GOVERNANCE_V4_ENABLED ? "Org V4 on" : "Org V4 off"} ·{" "}
            {COMPLIANCE_V4_ENABLED ? "Compliance V4 on" : "Compliance V4 off"} ·{" "}
            {INTEGRATIONS_V4_ENABLED ? "Integrations V4 on" : "Integrations V4 off"} ·{" "}
            {SRE_HARDENING_V4_ENABLED ? "SRE V4 on" : "SRE V4 off"} ·{" "}
            {AI_GOVERNANCE_V4_ENABLED ? "AI Gov V4 on" : "AI Gov V4 off"}
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
              disabled={!INTELLIGENCE_V3_ENABLED || running}
              onClick={() => void runRecompute()}
            >
              {running ? "Recomputing..." : "Recompute insights"}
            </button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Intelligence summary</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(intel ?? { message: "No intelligence data yet" }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Automation rules</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(rules ?? { message: "No rules found" }, null, 2)}
            </pre>
          </section>
          <section className={UI.enterprise.elevatedCard + " p-4 md:col-span-2"}>
            <div className="text-sm font-semibold text-[var(--ats-text)]">Recent automation runs</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[var(--ats-bg-panel)] p-3 text-xs text-[var(--ats-text-muted)]">
              {JSON.stringify(runs ?? { message: "No runs yet" }, null, 2)}
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
