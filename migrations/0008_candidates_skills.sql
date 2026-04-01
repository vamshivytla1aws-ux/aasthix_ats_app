-- Add skills (comma-separated) to candidates
BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS skills TEXT;

CREATE INDEX IF NOT EXISTS candidates_skills_idx ON candidates (skills);

COMMIT;

