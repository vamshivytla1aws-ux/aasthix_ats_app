-- Structured disposition reasons + audit trail (reject / withdraw / job close)

BEGIN;

CREATE TABLE IF NOT EXISTS disposition_reasons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('reject', 'withdraw', 'job_close')),
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS disposition_reasons_category_active_idx
  ON disposition_reasons (category, active, sort_order);

CREATE TABLE IF NOT EXISTS disposition_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('application', 'job')),
  entity_id BIGINT NOT NULL,
  disposition_reason_id BIGINT NOT NULL REFERENCES disposition_reasons (id) ON DELETE RESTRICT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS disposition_events_entity_idx
  ON disposition_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS disposition_events_user_idx
  ON disposition_events (user_id, created_at DESC);

-- Seed defaults (idempotent)
INSERT INTO disposition_reasons (code, label, category, sort_order)
VALUES
  ('reject_fit', 'Not a culture / values fit', 'reject', 10),
  ('reject_skills', 'Skills or experience gap', 'reject', 20),
  ('reject_stronger', 'Stronger candidate selected', 'reject', 30),
  ('reject_role', 'Role changed or cancelled', 'reject', 40),
  ('withdraw_candidate', 'Candidate withdrew', 'withdraw', 50),
  ('withdraw_comp', 'Compensation mismatch', 'withdraw', 60),
  ('withdraw_other', 'Other (withdrawal)', 'withdraw', 70),
  ('job_filled', 'Role filled', 'job_close', 100),
  ('job_cancelled', 'Requisition cancelled', 'job_close', 110),
  ('job_budget', 'Budget / headcount frozen', 'job_close', 120),
  ('job_hold', 'Hiring paused (internal)', 'job_close', 130),
  ('job_other', 'Other (job status)', 'job_close', 140)
ON CONFLICT (code) DO NOTHING;

COMMIT;
