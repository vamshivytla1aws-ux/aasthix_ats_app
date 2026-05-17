ALTER TABLE payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_status_check;

ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft', 'generated', 'approved', 'locked'));
