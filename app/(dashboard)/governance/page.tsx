"use client";

import React, { useState } from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { AUTOMATION_V3_ENABLED, CALIBRATION_V3_ENABLED, FORECAST_V3_ENABLED, INTELLIGENCE_V3_ENABLED } from "@/lib/featureFlags";
import { apiFetchJson } from "@/lib/apiClient";

export default function GovernancePage() {
  const [running, setRunning] = useState(false);
  const { data: intel } = useSWR("/api/intelligence/summary", dashboardFetcher);
  const { data: rules, mutate: mutateRules } = useSWR("/api/automation/rules", dashboardFetcher);
  const { data: runs, mutate: mutateRuns } = useSWR("/api/automation/runs?limit=20", dashboardFetcher);

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
            {CALIBRATION_V3_ENABLED ? "Calibration on" : "Calibration off"}
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
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}
