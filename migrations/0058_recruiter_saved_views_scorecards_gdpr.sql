-- Saved pipeline/candidate filter views per user, interview rubric ratings, GDPR request log, calendar stub.

BEGIN;

CREATE TABLE IF NOT EXISTS user_saved_views (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, page, name)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_views_user_page
  ON user_saved_views (user_id, page);

ALTER TABLE application_interview_question_feedback
  ADD COLUMN IF NOT EXISTS rating SMALLINT;

ALTER TABLE application_interview_question_feedback
  DROP CONSTRAINT IF EXISTS application_interview_question_feedback_rating_check;

ALTER TABLE application_interview_question_feedback
  ADD CONSTRAINT application_interview_question_feedback_rating_check
  CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

CREATE TABLE IF NOT EXISTS gdpr_candidate_requests (
  id BIGSERIAL PRIMARY KEY,
  candidate_id BIGINT NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  requested_by_user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('export', 'erase')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_candidate_requests_candidate
  ON gdpr_candidate_requests (candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_calendar_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  refresh_token_enc TEXT,
  access_token_enc TEXT,
  token_expires_at TIMESTAMPTZ,
  calendar_id TEXT,
  sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

COMMIT;
