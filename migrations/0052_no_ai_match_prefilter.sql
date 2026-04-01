-- No-AI matching: per-job scores (separate from AI hybrid in match_breakdown) + candidate prefilter columns.
-- Vector / pgvector is NOT used in this flow (reserved for AI semantic matching only).

BEGIN;

ALTER TABLE candidate_job_matches
  ADD COLUMN IF NOT EXISTS match_score_no_ai INT,
  ADD COLUMN IF NOT EXISTS hire_probability INT,
  ADD COLUMN IF NOT EXISTS decision_no_ai TEXT,
  ADD COLUMN IF NOT EXISTS computed_no_ai_at TIMESTAMPTZ;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS normalized_skills TEXT[],
  ADD COLUMN IF NOT EXISTS normalized_title TEXT,
  ADD COLUMN IF NOT EXISTS years_experience NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS domain_tags TEXT[],
  ADD COLUMN IF NOT EXISTS resume_length INT,
  ADD COLUMN IF NOT EXISTS profile_last_computed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_candidate_job_matches_job_no_ai_score
  ON candidate_job_matches (job_id, match_score_no_ai DESC NULLS LAST)
  WHERE match_score_no_ai IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_normalized_skills_gin
  ON candidates USING GIN (normalized_skills);

CREATE INDEX IF NOT EXISTS idx_candidates_years_experience
  ON candidates (years_experience);

CREATE INDEX IF NOT EXISTS idx_candidates_normalized_title
  ON candidates (normalized_title);

CREATE INDEX IF NOT EXISTS idx_candidates_domain_tags_gin
  ON candidates USING GIN (domain_tags);

CREATE INDEX IF NOT EXISTS idx_candidates_resume_length
  ON candidates (resume_length);

COMMIT;
