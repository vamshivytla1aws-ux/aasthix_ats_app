-- Drop candidate columns not present in the base schema
BEGIN;

ALTER TABLE candidates
  DROP COLUMN IF EXISTS skills,
  DROP COLUMN IF EXISTS experience,
  DROP COLUMN IF EXISTS resume_url;

COMMIT;

