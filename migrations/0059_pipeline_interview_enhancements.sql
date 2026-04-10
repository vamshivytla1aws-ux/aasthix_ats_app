-- Interview rounds template, per-application round history, pipeline WIP JSON on jobs

BEGIN;

CREATE TABLE IF NOT EXISTS job_interview_rounds (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  round_key TEXT NOT NULL,
  round_label TEXT NOT NULL,
  round_order INT NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, round_key)
);

CREATE INDEX IF NOT EXISTS job_interview_rounds_job_order_idx
  ON job_interview_rounds (job_id, round_order ASC, id ASC);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS current_interview_round_id BIGINT REFERENCES job_interview_rounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_interview_round_order INT,
  ADD COLUMN IF NOT EXISTS interview_round_status TEXT;

CREATE INDEX IF NOT EXISTS applications_current_interview_round_idx
  ON applications (current_interview_round_id)
  WHERE current_interview_round_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_interview_round_events (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  previous_round_order INT,
  new_round_order INT,
  previous_round_label TEXT,
  new_round_label TEXT,
  event_type TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS app_interview_round_events_app_idx
  ON application_interview_round_events (application_id, created_at DESC);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS pipeline_wip_limits JSONB;

COMMENT ON COLUMN jobs.pipeline_wip_limits IS 'Optional per-stage caps, e.g. {"Interview":8,"Screening":12}';

COMMIT;
