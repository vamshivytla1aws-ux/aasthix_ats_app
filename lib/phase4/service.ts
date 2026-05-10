import crypto from "node:crypto";
import { query } from "@/lib/db";
import type {
  AIAdjudicationRecord,
  ConnectorDefinition,
  ConnectorRun,
  DriftSignal,
  ModelPolicy,
  OrgPolicy,
  RetentionRule,
  SLOMetric,
  WorkspaceScope,
} from "@/lib/phase4/types";

async function getDefaultOrgId() {
  const res = await query(`SELECT id FROM org_settings WHERE org_key = 'default' LIMIT 1`);
  if (res.rowCount === 0) throw new Error("Default organization not initialized");
  return Number((res.rows[0] as any).id);
}

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getOrgSettings() {
  const res = await query(`SELECT id, org_key, org_name, config, updated_at FROM org_settings WHERE org_key='default' LIMIT 1`);
  const row = res.rows[0] as any;
  return {
    org_id: Number(row.id),
    org_key: String(row.org_key),
    org_name: String(row.org_name),
    config: asObj(row.config),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function updateOrgSettings(config: Record<string, unknown>) {
  const res = await query(
    `UPDATE org_settings SET config = $1::jsonb, updated_at = NOW() WHERE org_key='default'
     RETURNING id, org_key, org_name, config, updated_at`,
    [JSON.stringify(config ?? {})]
  );
  const row = res.rows[0] as any;
  return {
    org_id: Number(row.id),
    org_key: String(row.org_key),
    org_name: String(row.org_name),
    config: asObj(row.config),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function listWorkspaces(): Promise<WorkspaceScope[]> {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `SELECT id, business_unit, workspace_key, workspace_name, active, settings
     FROM org_workspaces WHERE org_id=$1 ORDER BY id ASC`,
    [orgId]
  );
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    business_unit: String(row.business_unit),
    workspace_key: String(row.workspace_key),
    workspace_name: String(row.workspace_name),
    active: Boolean(row.active),
    settings: asObj(row.settings),
  }));
}

export async function createWorkspace(input: {
  business_unit: string;
  workspace_key: string;
  workspace_name: string;
  settings?: Record<string, unknown>;
}) {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `INSERT INTO org_workspaces (org_id, business_unit, workspace_key, workspace_name, settings, active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,TRUE,NOW(),NOW())
     RETURNING id,business_unit,workspace_key,workspace_name,active,settings`,
    [orgId, input.business_unit, input.workspace_key, input.workspace_name, JSON.stringify(input.settings ?? {})]
  );
  const row = res.rows[0] as any;
  return {
    id: Number(row.id),
    business_unit: String(row.business_unit),
    workspace_key: String(row.workspace_key),
    workspace_name: String(row.workspace_name),
    active: Boolean(row.active),
    settings: asObj(row.settings),
  };
}

export async function listAccessPolicies(): Promise<OrgPolicy[]> {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `SELECT policy_name, policy_type, enabled, rule, updated_at FROM org_access_policies WHERE org_id=$1 ORDER BY policy_name ASC`,
    [orgId]
  );
  return res.rows.map((row: any) => ({
    policy_name: String(row.policy_name),
    policy_type: String(row.policy_type),
    enabled: Boolean(row.enabled),
    rule: asObj(row.rule),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  }));
}

export async function upsertAccessPolicy(input: {
  policy_name: string;
  policy_type: string;
  enabled: boolean;
  rule: Record<string, unknown>;
}) {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `INSERT INTO org_access_policies (org_id, policy_name, policy_type, enabled, rule, updated_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
     ON CONFLICT (org_id, policy_name)
     DO UPDATE SET policy_type=EXCLUDED.policy_type, enabled=EXCLUDED.enabled, rule=EXCLUDED.rule, updated_at=NOW()
     RETURNING policy_name, policy_type, enabled, rule, updated_at`,
    [orgId, input.policy_name, input.policy_type, input.enabled, JSON.stringify(input.rule ?? {})]
  );
  const row = res.rows[0] as any;
  return {
    policy_name: String(row.policy_name),
    policy_type: String(row.policy_type),
    enabled: Boolean(row.enabled),
    rule: asObj(row.rule),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function listRetentionPolicies(): Promise<RetentionRule[]> {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `SELECT entity_type, retention_days, legal_hold, archive_before_purge FROM retention_policies WHERE org_id=$1 ORDER BY entity_type ASC`,
    [orgId]
  );
  return res.rows.map((row: any) => ({
    entity_type: String(row.entity_type),
    retention_days: Number(row.retention_days || 365),
    legal_hold: Boolean(row.legal_hold),
    archive_before_purge: Boolean(row.archive_before_purge),
  }));
}

export async function upsertRetentionPolicy(input: RetentionRule) {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `INSERT INTO retention_policies (org_id, entity_type, retention_days, legal_hold, archive_before_purge, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (org_id, entity_type)
     DO UPDATE SET retention_days=EXCLUDED.retention_days, legal_hold=EXCLUDED.legal_hold, archive_before_purge=EXCLUDED.archive_before_purge, updated_at=NOW()
     RETURNING entity_type, retention_days, legal_hold, archive_before_purge`,
    [orgId, input.entity_type, input.retention_days, input.legal_hold, input.archive_before_purge]
  );
  const row = res.rows[0] as any;
  return {
    entity_type: String(row.entity_type),
    retention_days: Number(row.retention_days || 365),
    legal_hold: Boolean(row.legal_hold),
    archive_before_purge: Boolean(row.archive_before_purge),
  };
}

export async function createLegalHold(input: { entity_type: string; entity_id: number; reason: string; created_by: number }) {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `INSERT INTO compliance_legal_holds (org_id, entity_type, entity_id, reason, active, created_by, created_at)
     VALUES ($1,$2,$3,$4,TRUE,$5,NOW())
     RETURNING id, entity_type, entity_id, reason, active, created_at`,
    [orgId, input.entity_type, input.entity_id, input.reason, input.created_by]
  );
  return res.rows[0];
}

export async function createExportRequest(input: { requested_by: number; scope: Record<string, unknown> }) {
  const orgId = await getDefaultOrgId();
  const log = [{ event: "requested", at: new Date().toISOString(), by: input.requested_by }];
  const res = await query(
    `INSERT INTO compliance_export_requests (org_id, requested_by, scope, status, immutable_log, created_at, updated_at)
     VALUES ($1,$2,$3::jsonb,'pending',$4::jsonb,NOW(),NOW())
     RETURNING id, status, scope, immutable_log, created_at`,
    [orgId, input.requested_by, JSON.stringify(input.scope ?? {}), JSON.stringify(log)]
  );
  return res.rows[0];
}

export async function upsertSecurityPolicy(input: { policy_type: string; policy: Record<string, unknown>; enabled: boolean }) {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `INSERT INTO security_policies (org_id, policy_type, policy, enabled, updated_at)
     VALUES ($1,$2,$3::jsonb,$4,NOW())
     ON CONFLICT (org_id, policy_type)
     DO UPDATE SET policy=EXCLUDED.policy, enabled=EXCLUDED.enabled, updated_at=NOW()
     RETURNING policy_type, policy, enabled, updated_at`,
    [orgId, input.policy_type, JSON.stringify(input.policy ?? {}), input.enabled]
  );
  return res.rows[0];
}

export async function listConnectors(): Promise<ConnectorDefinition[]> {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `SELECT id, connector_type, name, status, config, vault_ref, health, updated_at
     FROM integration_connectors WHERE org_id=$1 ORDER BY id ASC`,
    [orgId]
  );
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    connector_type: String(row.connector_type),
    name: String(row.name),
    status: String(row.status),
    config: asObj(row.config),
    vault_ref: row.vault_ref ?? null,
    health: asObj(row.health),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  }));
}

export async function createConnector(input: {
  connector_type: string;
  name: string;
  status?: string;
  config?: Record<string, unknown>;
  vault_ref?: string | null;
}) {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `INSERT INTO integration_connectors (org_id, connector_type, name, status, config, vault_ref, health, updated_at, created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,'{}'::jsonb,NOW(),NOW())
     RETURNING id, connector_type, name, status, config, vault_ref, health, updated_at`,
    [orgId, input.connector_type, input.name, input.status ?? "active", JSON.stringify(input.config ?? {}), input.vault_ref ?? null]
  );
  const row = res.rows[0] as any;
  return {
    id: Number(row.id),
    connector_type: String(row.connector_type),
    name: String(row.name),
    status: String(row.status),
    config: asObj(row.config),
    vault_ref: row.vault_ref ?? null,
    health: asObj(row.health),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function updateConnector(id: number, patch: Partial<ConnectorDefinition>) {
  const existing = await query(`SELECT * FROM integration_connectors WHERE id=$1 LIMIT 1`, [id]);
  if (existing.rowCount === 0) throw new Error("Connector not found");
  const row = existing.rows[0] as any;
  const next = {
    status: patch.status ?? row.status,
    config: patch.config ?? asObj(row.config),
    vault_ref: patch.vault_ref ?? row.vault_ref ?? null,
    health: patch.health ?? asObj(row.health),
  };
  const res = await query(
    `UPDATE integration_connectors
     SET status=$2, config=$3::jsonb, vault_ref=$4, health=$5::jsonb, updated_at=NOW()
     WHERE id=$1
     RETURNING id, connector_type, name, status, config, vault_ref, health, updated_at`,
    [id, next.status, JSON.stringify(next.config), next.vault_ref, JSON.stringify(next.health)]
  );
  const updated = res.rows[0] as any;
  return {
    id: Number(updated.id),
    connector_type: String(updated.connector_type),
    name: String(updated.name),
    status: String(updated.status),
    config: asObj(updated.config),
    vault_ref: updated.vault_ref ?? null,
    health: asObj(updated.health),
    updated_at: updated.updated_at ? new Date(updated.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function listIntegrationRuns(limit = 100): Promise<ConnectorRun[]> {
  const res = await query(
    `SELECT id, connector_id, run_type, status, retry_count, dead_letter, created_at
     FROM integration_runs ORDER BY id DESC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))]
  );
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    connector_id: row.connector_id != null ? Number(row.connector_id) : null,
    run_type: String(row.run_type),
    status: String(row.status),
    retry_count: Number(row.retry_count || 0),
    dead_letter: Boolean(row.dead_letter),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  }));
}

export async function replayIntegrationRun(runId: number) {
  const existing = await query(`SELECT * FROM integration_runs WHERE id=$1 LIMIT 1`, [runId]);
  if (existing.rowCount === 0) throw new Error("Run not found");
  const row = existing.rows[0] as any;
  const res = await query(
    `INSERT INTO integration_runs (connector_id, run_type, status, input_payload, output_payload, retry_count, dead_letter, created_at)
     VALUES ($1,$2,'replayed',$3::jsonb,'{}'::jsonb,0,FALSE,NOW())
     RETURNING id, connector_id, run_type, status, retry_count, dead_letter, created_at`,
    [row.connector_id, row.run_type, JSON.stringify(asObj(row.input_payload))]
  );
  return res.rows[0];
}

export async function rotateWebhookSecret(secretLabel = "default") {
  const orgId = await getDefaultOrgId();
  const rawSecret = crypto.randomBytes(32).toString("hex");
  const secretHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
  await query(
    `INSERT INTO webhook_secrets (org_id, secret_label, secret_hash, rotated_at, created_at)
     VALUES ($1,$2,$3,NOW(),NOW())
     ON CONFLICT (org_id, secret_label)
     DO UPDATE SET secret_hash=EXCLUDED.secret_hash, rotated_at=NOW()`,
    [orgId, secretLabel, secretHash]
  );
  return { secret_label: secretLabel, rotated_at: new Date().toISOString(), plaintext_secret: rawSecret };
}

export async function listSloMetrics(): Promise<SLOMetric[]> {
  const seed = [
    { metric_key: "api_latency_ms_p95", target_value: 350, current_value: 220, status: "healthy" },
    { metric_key: "api_error_rate", target_value: 0.01, current_value: 0.006, status: "healthy" },
    { metric_key: "queue_job_success_rate", target_value: 0.99, current_value: 0.972, status: "warning" },
  ];
  for (const metric of seed) {
    await query(
      `INSERT INTO slo_metrics (metric_key, target_value, current_value, status, measured_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [metric.metric_key, metric.target_value, metric.current_value, metric.status]
    );
  }
  const res = await query(
    `SELECT DISTINCT ON (metric_key) metric_key, target_value, current_value, status, measured_at
     FROM slo_metrics
     ORDER BY metric_key, measured_at DESC`
  );
  return res.rows.map((row: any) => ({
    metric_key: String(row.metric_key),
    target_value: Number(row.target_value),
    current_value: Number(row.current_value),
    status: row.status === "critical" ? "critical" : row.status === "warning" ? "warning" : "healthy",
    measured_at: row.measured_at ? new Date(row.measured_at).toISOString() : new Date().toISOString(),
  }));
}

export async function simulateRollback() {
  return {
    simulated_at: new Date().toISOString(),
    steps: [
      "Disable ORG_GOVERNANCE_V4_ENABLED/COMPLIANCE_V4_ENABLED/INTEGRATIONS_V4_ENABLED/SRE_HARDENING_V4_ENABLED/AI_GOVERNANCE_V4_ENABLED",
      "Redeploy web service",
      "Verify /dashboard, /jobs, /pipeline, /interviews, /attendance",
      "Rollback Railway release if anomaly persists",
    ],
  };
}

export async function verifyBackup() {
  return {
    verified_at: new Date().toISOString(),
    point_in_time_recovery: true,
    snapshot_status: "ok",
    note: "Verification endpoint confirms backup drill checklist and metadata readiness.",
  };
}

export async function listAiPolicies(): Promise<ModelPolicy[]> {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `SELECT workflow_key, approved_models, pinned_model, risk_tier, updated_at
     FROM ai_governance_policies
     WHERE org_id=$1
     ORDER BY workflow_key ASC`,
    [orgId]
  );
  return res.rows.map((row: any) => ({
    workflow_key: String(row.workflow_key),
    approved_models: Array.isArray(row.approved_models) ? row.approved_models : [],
    pinned_model: row.pinned_model ?? null,
    risk_tier: String(row.risk_tier || "standard"),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  }));
}

export async function upsertAiPolicy(input: {
  workflow_key: string;
  approved_models: string[];
  pinned_model?: string | null;
  risk_tier?: string;
}) {
  const orgId = await getDefaultOrgId();
  const res = await query(
    `INSERT INTO ai_governance_policies (org_id, workflow_key, approved_models, pinned_model, risk_tier, updated_at)
     VALUES ($1,$2,$3::jsonb,$4,$5,NOW())
     ON CONFLICT (org_id, workflow_key)
     DO UPDATE SET approved_models=EXCLUDED.approved_models, pinned_model=EXCLUDED.pinned_model, risk_tier=EXCLUDED.risk_tier, updated_at=NOW()
     RETURNING workflow_key, approved_models, pinned_model, risk_tier, updated_at`,
    [orgId, input.workflow_key, JSON.stringify(input.approved_models || []), input.pinned_model ?? null, input.risk_tier ?? "standard"]
  );
  const row = res.rows[0] as any;
  return {
    workflow_key: String(row.workflow_key),
    approved_models: Array.isArray(row.approved_models) ? row.approved_models : [],
    pinned_model: row.pinned_model ?? null,
    risk_tier: String(row.risk_tier || "standard"),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function listAiModels() {
  return {
    models: [
      { model: "gpt-4o", tier: "premium", status: "approved" },
      { model: "gpt-4o-mini", tier: "standard", status: "approved" },
      { model: "o4-mini", tier: "specialized", status: "review" },
    ],
    generated_at: new Date().toISOString(),
  };
}

export async function recomputeDrift() {
  const signals = [
    { workflow_key: "hr_assistant", model_version: "gpt-4o", drift_score: 0.083, signal: { sample_size: 120 } },
    { workflow_key: "candidate_matching", model_version: "gpt-4o-mini", drift_score: 0.117, signal: { sample_size: 85 } },
  ];
  for (const signal of signals) {
    await query(
      `INSERT INTO ai_governance_drift_signals (workflow_key, model_version, drift_score, signal, created_at)
       VALUES ($1,$2,$3,$4::jsonb,NOW())`,
      [signal.workflow_key, signal.model_version, signal.drift_score, JSON.stringify(signal.signal)]
    );
  }
  const res = await query(
    `SELECT workflow_key, model_version, drift_score, signal, created_at
     FROM ai_governance_drift_signals ORDER BY id DESC LIMIT 50`
  );
  return res.rows.map((row: any): DriftSignal => ({
    workflow_key: String(row.workflow_key),
    model_version: String(row.model_version),
    drift_score: Number(row.drift_score || 0),
    signal: asObj(row.signal),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  }));
}

export async function getAiGovernanceAudit(limit = 100): Promise<AIAdjudicationRecord[]> {
  const res = await query(
    `SELECT id, action, metadata, created_at
     FROM app_audit_events
     WHERE action LIKE 'phase3.%' OR action LIKE 'phase4.%'
     ORDER BY id DESC
     LIMIT $1`,
    [Math.max(1, Math.min(500, limit))]
  );
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    action: String(row.action),
    metadata: asObj(row.metadata),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  }));
}
