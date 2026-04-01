-- Add salary fields to candidates
BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS current_salary NUMERIC,
  ADD COLUMN IF NOT EXISTS expected_salary NUMERIC;

CREATE INDEX IF NOT EXISTS candidates_current_salary_idx ON candidates(current_salary);
CREATE INDEX IF NOT EXISTS candidates_expected_salary_idx ON candidates(expected_salary);

COMMIT;

