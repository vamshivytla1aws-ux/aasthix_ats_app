-- Extend candidates with extra fields used by UI/APIs
BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS skills TEXT,
  ADD COLUMN IF NOT EXISTS experience INTEGER CHECK (experience IS NULL OR experience >= 0),
  ADD COLUMN IF NOT EXISTS resume_url TEXT;

COMMIT;
