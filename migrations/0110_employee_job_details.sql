-- Store current employment details on the employee profile.
-- Existing salary structures and historical payslips remain unchanged.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department TEXT NULL,
  ADD COLUMN IF NOT EXISTS designation TEXT NULL;
