BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS location_source TEXT NOT NULL DEFAULT 'parsed';

ALTER TABLE candidates
  DROP CONSTRAINT IF EXISTS candidates_location_source_check;

ALTER TABLE candidates
  ADD CONSTRAINT candidates_location_source_check
  CHECK (location_source IN ('parsed', 'manual'));

CREATE INDEX IF NOT EXISTS candidates_location_source_idx
  ON candidates (location_source, updated_at DESC);

COMMIT;
