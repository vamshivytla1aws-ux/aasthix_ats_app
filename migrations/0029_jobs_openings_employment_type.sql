BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS open_positions INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'Full Time';

CREATE INDEX IF NOT EXISTS jobs_employment_type_idx
  ON jobs(employment_type, created_at DESC);

COMMIT;
