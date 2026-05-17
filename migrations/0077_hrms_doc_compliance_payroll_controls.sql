ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS expiry_date DATE NULL;

CREATE TABLE IF NOT EXISTS hrms_document_policies (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  department TEXT NULL,
  employment_type TEXT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_days INTEGER NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hrms_document_policies_lookup_idx
  ON hrms_document_policies(category, department, employment_type, is_active);

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS locked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS unlocked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS unlock_reason TEXT NULL;
