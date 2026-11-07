ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS package_review JSONB;
ALTER TABLE tax_configs ADD COLUMN IF NOT EXISTS payroll_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS hrms_correction_requests (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('profile', 'salary', 'payslip')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by BIGINT REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS hrms_corrections_employee_category_idx
  ON hrms_correction_requests(employee_id, category, status, id DESC);
