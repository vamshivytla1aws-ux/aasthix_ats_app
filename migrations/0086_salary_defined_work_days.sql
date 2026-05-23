ALTER TABLE salary_structures
ADD COLUMN IF NOT EXISTS defined_work_days NUMERIC(6,2) NULL;

UPDATE salary_structures
SET defined_work_days = total_paid_days
WHERE defined_work_days IS NULL;
