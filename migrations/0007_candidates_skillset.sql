-- Add skillset to candidates
BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS skillset TEXT[] DEFAULT '{}'::text[];

-- Fast filtering on skillset (array)
CREATE INDEX IF NOT EXISTS candidates_skillset_gin_idx ON candidates USING GIN (skillset);

COMMIT;

