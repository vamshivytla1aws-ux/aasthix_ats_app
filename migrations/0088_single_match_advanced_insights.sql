BEGIN;

ALTER TABLE single_candidate_match_checks
  ADD COLUMN IF NOT EXISTS advanced_insights_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
