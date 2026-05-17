-- HRMS enterprise modules: employee directory, documents, attendance rules,
-- payroll approvals, onboarding/exit workflows, performance management.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS employment_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS joining_date DATE NULL,
  ADD COLUMN IF NOT EXISTS reporting_manager_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_location TEXT NULL,
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_employment_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_employment_status_check
  CHECK (employment_status IN ('active', 'inactive', 'resigned'));

CREATE TABLE IF NOT EXISTS employee_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_blob BYTEA NOT NULL,
  uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT employee_documents_category_check CHECK (
    category IN (
      'offer_letter',
      'id_proof',
      'address_proof',
      'experience_letter',
      'education_certificate',
      'payslip',
      'policy_acknowledgement'
    )
  )
);

CREATE INDEX IF NOT EXISTS employee_documents_user_idx
  ON employee_documents (user_id, category, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS employee_onboarding_exit (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_type TEXT NOT NULL CHECK (workflow_type IN ('onboarding', 'exit')),
  status TEXT NOT NULL DEFAULT 'in_progress',
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  notice_start_date DATE NULL,
  notice_end_date DATE NULL,
  resignation_reason TEXT NULL,
  final_settlement_status TEXT NULL,
  approved_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_onboarding_exit_user_idx
  ON employee_onboarding_exit (user_id, workflow_type, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance_shift_rules (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_name TEXT NOT NULL DEFAULT 'General',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  late_grace_minutes INTEGER NOT NULL DEFAULT 15,
  early_logout_grace_minutes INTEGER NOT NULL DEFAULT 15,
  half_day_minutes INTEGER NOT NULL DEFAULT 240,
  overtime_after_minutes INTEGER NOT NULL DEFAULT 480,
  wfh_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  requested_check_in TIMESTAMPTZ NULL,
  requested_check_out TIMESTAMPTZ NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  manager_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT NULL,
  decided_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attendance_corrections_user_idx
  ON attendance_corrections(user_id, attendance_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS wfh_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  manager_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT NULL,
  decided_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wfh_requests_user_idx
  ON wfh_requests(user_id, from_date DESC, to_date DESC);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id BIGSERIAL PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year >= 2000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'approved')),
  generated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NULL,
  approved_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(month, year)
);

CREATE TABLE IF NOT EXISTS payroll_run_items (
  id BIGSERIAL PRIMARY KEY,
  payroll_run_id BIGINT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payslip_id BIGINT NULL REFERENCES payslips(id) ON DELETE SET NULL,
  gross_monthly NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  lop_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  lop_deduction_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  loan_deduction_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS payroll_run_items_run_idx
  ON payroll_run_items(payroll_run_id, employee_id);

CREATE TABLE IF NOT EXISTS performance_cycles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_goals (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  weight_percent NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  self_review JSONB NOT NULL DEFAULT '{}'::jsonb,
  manager_review JSONB NOT NULL DEFAULT '{}'::jsonb,
  hr_review JSONB NOT NULL DEFAULT '{}'::jsonb,
  rating NUMERIC(4,2) NULL,
  recommendation TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'manager_reviewed', 'hr_reviewed', 'closed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cycle_id, employee_id)
);

