BEGIN;

CREATE TABLE IF NOT EXISTS job_skill_profiles (
  job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  must_have_skills TEXT,
  nice_to_have_skills TEXT,
  role_keywords TEXT,
  extraction_mode TEXT NOT NULL DEFAULT 'RULE_BASED',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_job_matches (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  match_score INT NOT NULL,
  matched_skills TEXT,
  missing_must_have TEXT,
  match_breakdown JSONB,
  already_applied BOOLEAN NOT NULL DEFAULT FALSE,
  application_stage TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_job_score
  ON candidate_job_matches (job_id, match_score DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_candidate
  ON candidate_job_matches (candidate_id);

COMMIT;
