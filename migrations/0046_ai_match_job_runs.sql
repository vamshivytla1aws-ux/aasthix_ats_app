BEGIN;

CREATE TABLE IF NOT EXISTS ai_match_job_runs (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bullmq_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  total_candidates INT NOT NULL DEFAULT 0,
  completed_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_match_job_items (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES ai_match_job_runs(id) ON DELETE CASCADE,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  error TEXT,
  retry_requested BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_match_job_runs_job ON ai_match_job_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_match_job_items_run ON ai_match_job_items(run_id);

COMMIT;
