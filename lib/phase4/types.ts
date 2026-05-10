export type OrgPolicy = {
  policy_name: string;
  policy_type: string;
  enabled: boolean;
  rule: Record<string, unknown>;
  updated_at: string;
};

export type WorkspaceScope = {
  id: number;
  business_unit: string;
  workspace_key: string;
  workspace_name: string;
  active: boolean;
  settings: Record<string, unknown>;
};

export type RetentionRule = {
  entity_type: string;
  retention_days: number;
  legal_hold: boolean;
  archive_before_purge: boolean;
};

export type ConnectorDefinition = {
  id: number;
  connector_type: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  vault_ref: string | null;
  health: Record<string, unknown>;
  updated_at: string;
};

export type ConnectorRun = {
  id: number;
  connector_id: number | null;
  run_type: string;
  status: string;
  retry_count: number;
  dead_letter: boolean;
  created_at: string;
};

export type WebhookDelivery = {
  rotated_at: string;
  secret_label: string;
};

export type SLOMetric = {
  metric_key: string;
  target_value: number;
  current_value: number;
  status: "healthy" | "warning" | "critical";
  measured_at: string;
};

export type ModelPolicy = {
  workflow_key: string;
  approved_models: string[];
  pinned_model: string | null;
  risk_tier: string;
  updated_at: string;
};

export type DriftSignal = {
  workflow_key: string;
  model_version: string;
  drift_score: number;
  signal: Record<string, unknown>;
  created_at: string;
};

export type AIAdjudicationRecord = {
  id: number;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
