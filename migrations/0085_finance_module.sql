CREATE TABLE IF NOT EXISTS finance_workspaces (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_partners (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES finance_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role_label TEXT,
  joined_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_partners_workspace_name_uq
  ON finance_partners(workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS finance_import_batches (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES finance_workspaces(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  notes TEXT,
  imported_transactions INT NOT NULL DEFAULT 0,
  skipped_duplicates INT NOT NULL DEFAULT 0,
  reconciliation_entries INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  source_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES finance_workspaces(id) ON DELETE CASCADE,
  tx_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  tx_date DATE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  total_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  partner_id BIGINT REFERENCES finance_partners(id) ON DELETE SET NULL,
  account_entry_type TEXT,
  payments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  shares_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_fingerprint TEXT,
  import_batch_id TEXT REFERENCES finance_import_batches(batch_id) ON DELETE SET NULL,
  audit_note TEXT,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_transactions_workspace_date_idx
  ON finance_transactions(workspace_id, tx_date DESC);

CREATE INDEX IF NOT EXISTS finance_transactions_workspace_kind_idx
  ON finance_transactions(workspace_id, kind);

CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_fingerprint_uq
  ON finance_transactions(workspace_id, source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance_user_preferences (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id BIGINT NOT NULL REFERENCES finance_workspaces(id) ON DELETE CASCADE,
  table_density TEXT,
  default_range_preset TEXT,
  contribution_target_minor BIGINT,
  last_filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, workspace_id)
);

INSERT INTO finance_workspaces (code, name, currency, is_active)
VALUES ('AASTHIX', 'AASTHIX TALENT', 'INR', TRUE)
ON CONFLICT (code) DO NOTHING;
