-- Persisted 1-to-1 job↔candidate match checks (does not replace candidate_job_matches).

BEGIN;

CREATE TABLE IF NOT EXISTS single_candidate_match_checks (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  use_ai BOOLEAN NOT NULL DEFAULT false,
  match_score SMALLINT NOT NULL,
  match_score_no_ai SMALLINT,
  ai_match_score SMALLINT,
  decision TEXT,
  decision_no_ai TEXT,
  ai_decision TEXT,
  matched_skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_required_skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_single_match_checks_job_created
  ON single_candidate_match_checks (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_single_match_checks_job_candidate_created
  ON single_candidate_match_checks (job_id, candidate_id, created_at DESC);

COMMIT;
