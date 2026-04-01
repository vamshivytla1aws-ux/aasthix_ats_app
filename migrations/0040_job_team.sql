-- Job team membership: hiring managers, recruiters, coordinators per requisition
-- Extends visibility so team members can see jobs/applications they don't own.

BEGIN;

CREATE TABLE IF NOT EXISTS job_team (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('hiring_manager', 'recruiter', 'coordinator', 'sourcer', 'observer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS job_team_job_idx
  ON job_team (job_id);

CREATE INDEX IF NOT EXISTS job_team_user_idx
  ON job_team (user_id, role);

CREATE INDEX IF NOT EXISTS job_team_user_job_idx
  ON job_team (user_id, job_id);

COMMIT;
