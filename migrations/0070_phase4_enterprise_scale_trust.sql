BEGIN;

CREATE TABLE IF NOT EXISTS org_settings (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT UNIQUE NOT NULL DEFAULT 'default',
  org_name TEXT NOT NULL DEFAULT 'Default Organization',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_workspaces (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  business_unit TEXT NOT NULL DEFAULT 'general',
  workspace_key TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, workspace_key)
);

CREATE TABLE IF NOT EXISTS org_access_policies (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  policy_type TEXT NOT NULL,
  rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, policy_name)
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  retention_days INT NOT NULL DEFAULT 365,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  archive_before_purge BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, entity_type)
);

CREATE TABLE IF NOT EXISTS compliance_legal_holds (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_export_requests (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  immutable_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_policies (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, policy_type)
);

CREATE TABLE IF NOT EXISTS integration_connectors (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  vault_ref TEXT,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_runs (
  id BIGSERIAL PRIMARY KEY,
  connector_id BIGINT REFERENCES integration_connectors(id) ON DELETE SET NULL,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INT NOT NULL DEFAULT 0,
  dead_letter BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_secrets (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  secret_label TEXT NOT NULL DEFAULT 'default',
  secret_hash TEXT NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, secret_label)
);

CREATE TABLE IF NOT EXISTS slo_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_key TEXT NOT NULL,
  target_value NUMERIC(12,4) NOT NULL,
  current_value NUMERIC(12,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'healthy',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_governance_policies (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE,
  workflow_key TEXT NOT NULL,
  approved_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  pinned_model TEXT,
  risk_tier TEXT NOT NULL DEFAULT 'standard',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, workflow_key)
);

CREATE TABLE IF NOT EXISTS ai_governance_drift_signals (
  id BIGSERIAL PRIMARY KEY,
  workflow_key TEXT NOT NULL,
  model_version TEXT NOT NULL,
  drift_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  signal JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO org_settings (org_key, org_name, config)
VALUES ('default', 'AASTHIX Enterprise', '{"rollout":"phase4_shadow"}'::jsonb)
ON CONFLICT (org_key) DO NOTHING;

INSERT INTO org_workspaces (org_id, business_unit, workspace_key, workspace_name, settings)
SELECT id, 'delivery', 'default-workspace', 'Default Workspace', '{}'::jsonb
FROM org_settings
WHERE org_key = 'default'
ON CONFLICT (org_id, workspace_key) DO NOTHING;

COMMIT;
