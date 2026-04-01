-- Enterprise careers portal: source tracking, job experience line, candidate summary, phone uniqueness, funnel analytics

BEGIN;

-- Candidate acquisition source (UI default; careers flow sets "Careers Page")
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'UI';

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS experience_summary TEXT;

-- Application channel (legacy column may be NULL)
UPDATE applications SET source = 'UI' WHERE source IS NULL OR btrim(source) = '';

ALTER TABLE applications
  ALTER COLUMN source SET DEFAULT 'UI';

-- Optional experience line shown on public JD / jobs table
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS experience_requirement TEXT;

-- One phone number per recruiter workspace (non-empty)
CREATE UNIQUE INDEX IF NOT EXISTS candidates_user_phone_unique
  ON candidates (created_by_user_id, phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

CREATE INDEX IF NOT EXISTS applications_source_idx
  ON applications (source, created_at DESC);

CREATE INDEX IF NOT EXISTS candidates_source_idx
  ON candidates (source, created_at DESC);

-- Anonymous funnel for conversion metrics (careers publisher scoped)
CREATE TABLE IF NOT EXISTS careers_funnel_events (
  id BIGSERIAL PRIMARY KEY,
  publisher_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT careers_funnel_events_type_check
    CHECK (event_type IN ('view_job_list', 'view_jd', 'start_apply', 'submit_success'))
);

CREATE INDEX IF NOT EXISTS careers_funnel_pub_job_type_idx
  ON careers_funnel_events (publisher_user_id, job_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS careers_funnel_pub_created_idx
  ON careers_funnel_events (publisher_user_id, created_at DESC);

COMMIT;
