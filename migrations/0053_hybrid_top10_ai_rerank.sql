-- Hybrid No-AI bulk + single-call AI rerank (top 10 only). Does not overwrite No-AI scores.

BEGIN;

ALTER TABLE candidate_job_matches
  ADD COLUMN IF NOT EXISTS no_ai_rank INT,
  ADD COLUMN IF NOT EXISTS ai_rerank_score INT,
  ADD COLUMN IF NOT EXISTS ai_rerank_decision TEXT,
  ADD COLUMN IF NOT EXISTS ai_rerank_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_rerank_rank INT;

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_job_ai_rerank_rank
  ON candidate_job_matches (job_id, ai_rerank_rank ASC NULLS LAST)
  WHERE ai_rerank_rank IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_job_no_ai_rank
  ON candidate_job_matches (job_id, no_ai_rank ASC NULLS LAST)
  WHERE no_ai_rank IS NOT NULL;

ALTER TABLE ai_match_job_runs
  ADD COLUMN IF NOT EXISTS rerank_strategy TEXT,
  ADD COLUMN IF NOT EXISTS top_n INT,
  ADD COLUMN IF NOT EXISTS rerank_model TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens INT,
  ADD COLUMN IF NOT EXISTS output_tokens INT,
  ADD COLUMN IF NOT EXISTS latency_ms INT,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;

COMMIT;
