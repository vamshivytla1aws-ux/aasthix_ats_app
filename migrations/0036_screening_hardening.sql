-- Screening: idempotency, drafts, reminders, audit, analytics support
BEGIN;

-- Collapse legacy duplicate pending rows (keep newest per application) before unique index
UPDATE screening_tests st
SET status = 'expired', updated_at = NOW()
WHERE st.status = 'pending'
  AND st.id NOT IN (
    SELECT DISTINCT ON (application_id) id
    FROM screening_tests
    WHERE status = 'pending'
    ORDER BY application_id, created_at DESC NULLS LAST, id DESC
  );

-- At most one pending test per application (concurrent-safe with transactional workflow)
CREATE UNIQUE INDEX IF NOT EXISTS screening_tests_one_pending_per_application
  ON screening_tests (application_id)
  WHERE status = 'pending';

ALTER TABLE screening_tests
  ADD COLUMN IF NOT EXISTS reminder_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evaluation_model TEXT,
  ADD COLUMN IF NOT EXISTS generation_model TEXT;

CREATE TABLE IF NOT EXISTS screening_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  application_id BIGINT,
  test_id BIGINT,
  candidate_id BIGINT,
  created_by_user_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS screening_audit_application_idx
  ON screening_audit_events(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS screening_audit_test_idx
  ON screening_audit_events(test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS screening_audit_type_idx
  ON screening_audit_events(event_type, created_at DESC);

-- Server-side draft for same-device resume (paired with client device_id + valid token on write)
CREATE TABLE IF NOT EXISTS screening_test_drafts (
  test_id BIGINT NOT NULL REFERENCES screening_tests(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (test_id, device_id)
);

CREATE INDEX IF NOT EXISTS screening_test_drafts_updated_idx
  ON screening_test_drafts(updated_at DESC);

COMMIT;
