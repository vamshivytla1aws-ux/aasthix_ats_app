-- Add stage column for pipeline (and keep status in sync)
BEGIN;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS stage TEXT;

-- Backfill from existing status if present
UPDATE applications
SET stage = COALESCE(stage, status)
WHERE stage IS NULL;

ALTER TABLE applications
  ALTER COLUMN stage SET NOT NULL;

ALTER TABLE applications
  ALTER COLUMN stage SET DEFAULT 'Applied';

-- Constrain stage to allowed pipeline values
ALTER TABLE applications
  ADD CONSTRAINT IF NOT EXISTS applications_stage_check
  CHECK (stage IN ('Applied', 'Screening', 'Interview', 'Selected', 'Rejected'));

CREATE INDEX IF NOT EXISTS applications_stage_idx ON applications(stage);
CREATE INDEX IF NOT EXISTS applications_stage_updated_at_idx ON applications(stage, updated_at DESC);

COMMIT;

