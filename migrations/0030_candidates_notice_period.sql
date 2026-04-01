BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS notice_period TEXT;

COMMIT;
