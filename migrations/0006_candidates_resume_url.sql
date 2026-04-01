-- Add resume_url to candidates
BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS resume_url TEXT;

CREATE INDEX IF NOT EXISTS candidates_resume_url_idx ON candidates(resume_url);

COMMIT;

