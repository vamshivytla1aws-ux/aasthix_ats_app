import { query } from "@/lib/db";
import type { AutomationActionResult, AutomationRule, AutomationRun } from "@/lib/phase3/types";
import { recordPhase3AuditEvent } from "@/lib/phase3/audit";
import { randomUUID } from "crypto";

function normalizeMode(value: unknown): AutomationRule["mode"] {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "approval-required" || mode === "auto-execute" || mode === "recommend-only") return mode;
  return "recommend-only";
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function listAutomationRules(): Promise<AutomationRule[]> {
  const res = await query(`SELECT id, key, name, description, mode, enabled, paused, config, updated_at FROM automation_rules ORDER BY id ASC`);
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    key: String(row.key),
    name: String(row.name),
    description: String(row.description || ""),
    mode: normalizeMode(row.mode),
    enabled: Boolean(row.enabled),
    paused: Boolean(row.paused),
    config: normalizeRecord(row.config),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  }));
}

export async function updateAutomationRule(input: {
  id: number;
  actorUserId: number;
  mode?: AutomationRule["mode"];
  enabled?: boolean;
  paused?: boolean;
  config?: Record<string, unknown>;
}) {
  const existing = await query(`SELECT id, mode, enabled, paused, config FROM automation_rules WHERE id = $1 LIMIT 1`, [input.id]);
  if (existing.rowCount === 0) throw new Error("Rule not found");
  const row = existing.rows[0] as any;
  const nextMode = normalizeMode(input.mode ?? row.mode);
  const nextEnabled = typeof input.enabled === "boolean" ? input.enabled : Boolean(row.enabled);
  const nextPaused = typeof input.paused === "boolean" ? input.paused : Boolean(row.paused);
  const nextConfig = input.config ?? normalizeRecord(row.config);
  const updated = await query(
    `UPDATE automation_rules
     SET mode = $2, enabled = $3, paused = $4, config = $5::jsonb, updated_by = $6, updated_at = NOW()
     WHERE id = $1
     RETURNING id, key, name, description, mode, enabled, paused, config, updated_at`,
    [input.id, nextMode, nextEnabled, nextPaused, JSON.stringify(nextConfig), input.actorUserId]
  );
  await recordPhase3AuditEvent({
    actorUserId: input.actorUserId,
    action: "phase3.automation.rule_updated",
    metadata: { rule_id: input.id, mode: nextMode, enabled: nextEnabled, paused: nextPaused },
  });
  return (await listAutomationRules()).find((rule) => rule.id === Number(updated.rows[0].id))!;
}

async function buildSuggestedActions(ruleKey: string, scope: Record<string, unknown>): Promise<AutomationActionResult[]> {
  if (ruleKey === "stale_stage_followup") {
    const staleDays = Number(scope.stale_days ?? 7);
    const stale = await query(
      `SELECT id FROM applications
       WHERE NOW() - updated_at > ($1::int * INTERVAL '1 day')
       ORDER BY updated_at ASC
       LIMIT 20`,
      [staleDays]
    );
    return stale.rows.map((row: any) => ({
      action: "create_followup_task",
      entity_id: Number(row.id),
      status: "suggested",
      detail: `Application ${row.id} exceeded stale SLA`,
    }));
  }
  if (ruleKey === "interview_risk_notify") {
    const risky = await query(
      `SELECT application_id FROM application_risk_insights
       WHERE risk_type = 'interview_no_show_risk' AND risk_score >= 70
       ORDER BY risk_score DESC
       LIMIT 20`
    );
    return risky.rows.map((row: any) => ({
      action: "notify_owner_panel",
      entity_id: Number(row.application_id),
      status: "suggested",
      detail: `Interview no-show risk is high for application ${row.application_id}`,
    }));
  }
  if (ruleKey === "overload_reassignment") {
    return [{ action: "suggest_reassignments", status: "suggested", detail: "Recruiter load rebalance suggestions generated." }];
  }
  return [{ action: "candidate_pending_nudge", status: "suggested", detail: "Candidate pending actions found for follow-up." }];
}

export async function runAutomation(input: {
  mode: "simulate" | "execute";
  actorUserId: number;
  ruleId?: number;
  scope?: Record<string, unknown>;
}) {
  const scope = normalizeRecord(input.scope);
  const rules = input.ruleId
    ? await query(`SELECT * FROM automation_rules WHERE id = $1 AND enabled = TRUE AND paused = FALSE`, [input.ruleId])
    : await query(`SELECT * FROM automation_rules WHERE enabled = TRUE AND paused = FALSE ORDER BY id ASC`);

  const runResults: AutomationRun[] = [];
  for (const rule of rules.rows as any[]) {
    const normalizedRuleMode = normalizeMode(rule.mode);
    const policy = input.mode === "simulate"
      ? "recommend_only"
      : normalizedRuleMode === "auto-execute"
        ? "auto_execute"
        : normalizedRuleMode === "approval-required"
          ? "approval_required"
          : "recommend_only";
    const suggested = await buildSuggestedActions(String(rule.key), scope);
    const actions =
      input.mode === "execute" && normalizedRuleMode === "auto-execute"
        ? suggested.map((item) => ({ ...item, status: "executed" as const }))
        : suggested;
    const status =
      input.mode === "execute" && normalizedRuleMode !== "auto-execute"
        ? "skipped_requires_approval"
        : "completed";
    const affectedEntities = actions
      .map((item) => (typeof item.entity_id === "number" ? item.entity_id : null))
      .filter((id): id is number => Number.isFinite(id));
    const executionTraceId = randomUUID();
    const inserted = await query(
      `INSERT INTO automation_runs (rule_id, run_mode, status, scope, actions, replay_metadata, triggered_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
       RETURNING id, rule_id, run_mode, status, scope, actions, replay_metadata, triggered_by, created_at`,
      [
        rule.id,
        input.mode,
        status,
        JSON.stringify(scope),
        JSON.stringify(actions),
        JSON.stringify({
          rule_key: rule.key,
          rule_mode: rule.mode,
          rule_version: "v1",
          trigger_source: input.mode === "simulate" ? "simulate_api" : "execute_api",
          execution_policy: policy,
          execution_trace_id: executionTraceId,
          affected_entities: affectedEntities,
        }),
        input.actorUserId,
      ]
    );
    const created = inserted.rows[0] as any;
    const run: AutomationRun = {
      id: Number(created.id),
      rule_id: created.rule_id != null ? Number(created.rule_id) : null,
      run_mode: String(created.run_mode),
      status: String(created.status),
      scope: normalizeRecord(created.scope),
      actions: Array.isArray(created.actions) ? (created.actions as AutomationActionResult[]) : [],
      replay_metadata: normalizeRecord(created.replay_metadata),
      triggered_by: created.triggered_by != null ? Number(created.triggered_by) : null,
      created_at: created.created_at ? new Date(created.created_at).toISOString() : new Date().toISOString(),
      mode: normalizedRuleMode,
      rule_version: "v1",
      trigger_source: input.mode === "simulate" ? "simulate_api" : "execute_api",
      affected_entities: affectedEntities,
      execution_trace_id: executionTraceId,
    };
    runResults.push(run);

    await recordPhase3AuditEvent({
      actorUserId: input.actorUserId,
      action: `phase3.automation.${input.mode === "simulate" ? "simulated" : "executed"}`,
      metadata: {
        run_id: run.id,
        rule_id: run.rule_id,
        status: run.status,
        actions: run.actions.length,
        execution_policy: policy,
        execution_trace_id: executionTraceId,
      },
    });
  }
  return runResults;
}

export async function listAutomationRuns(limit = 100): Promise<AutomationRun[]> {
  const res = await query(
    `SELECT id, rule_id, run_mode, status, scope, actions, replay_metadata, triggered_by, created_at
     FROM automation_runs
     ORDER BY id DESC
     LIMIT $1`,
    [Math.max(1, Math.min(500, limit))]
  );
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    rule_id: row.rule_id != null ? Number(row.rule_id) : null,
    run_mode: String(row.run_mode),
    status: String(row.status),
    scope: normalizeRecord(row.scope),
    actions: Array.isArray(row.actions) ? (row.actions as AutomationActionResult[]) : [],
    replay_metadata: normalizeRecord(row.replay_metadata),
    triggered_by: row.triggered_by != null ? Number(row.triggered_by) : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    mode: normalizeMode((row.replay_metadata as Record<string, unknown> | undefined)?.["rule_mode"]),
    rule_version: String((row.replay_metadata as Record<string, unknown> | undefined)?.["rule_version"] || "v1"),
    trigger_source: String((row.replay_metadata as Record<string, unknown> | undefined)?.["trigger_source"] || "system") as
      | "simulate_api"
      | "execute_api"
      | "system",
    affected_entities: Array.isArray((row.replay_metadata as Record<string, unknown> | undefined)?.["affected_entities"])
      ? ((row.replay_metadata as Record<string, unknown>)["affected_entities"] as unknown[])
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n))
      : [],
    execution_trace_id: String((row.replay_metadata as Record<string, unknown> | undefined)?.["execution_trace_id"] || ""),
  }));
}
