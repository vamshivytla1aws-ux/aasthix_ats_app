CREATE TABLE IF NOT EXISTS training_submissions (
  id BIGSERIAL PRIMARY KEY,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'public_training',
  consent_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  resume_url TEXT,
  resume_text TEXT,
  resume_file_name TEXT,
  resume_file_type TEXT,
  resume_file_size INTEGER,
  resume_blob BYTEA,
  resume_parse_status TEXT NOT NULL DEFAULT 'pending',
  resume_parse_error TEXT,
  question_generation_status TEXT NOT NULL DEFAULT 'pending',
  question_generation_error TEXT,
  generated_mode TEXT NOT NULL DEFAULT 'RULE_BASED',
  generated_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'new',
  reviewer_notes TEXT,
  session_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_submissions_submitted_at
  ON training_submissions (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_submissions_review_status
  ON training_submissions (review_status);

CREATE INDEX IF NOT EXISTS idx_training_submissions_email_lower
  ON training_submissions (LOWER(email));

CREATE TABLE IF NOT EXISTS training_funnel_events (
  id BIGSERIAL PRIMARY KEY,
  publisher_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_funnel_events_created_at
  ON training_funnel_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_funnel_events_event_type
  ON training_funnel_events (event_type);
