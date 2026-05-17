CREATE TABLE IF NOT EXISTS leave_policies (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  sick_accrual_monthly NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  casual_accrual_monthly NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  sick_carry_forward_cap NUMERIC(6,2) NOT NULL DEFAULT 12.00,
  casual_carry_forward_cap NUMERIC(6,2) NOT NULL DEFAULT 12.00,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_policies_singleton CHECK (id = 1)
);

INSERT INTO leave_policies (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS holiday_calendar (
  id BIGSERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  holiday_name TEXT NOT NULL,
  location_scope TEXT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_manager_map (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  manager_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_manager_self_check CHECK (user_id <> manager_user_id)
);

CREATE TABLE IF NOT EXISTS employee_leave_balances (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  opening_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  accrued_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  used_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  last_accrual_month DATE NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_leave_balances_type_check CHECK (leave_type IN ('sick', 'casual')),
  UNIQUE (user_id, leave_type)
);

CREATE INDEX IF NOT EXISTS employee_leave_balances_user_idx
  ON employee_leave_balances (user_id);

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  leave_type TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  total_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  paid_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  lop_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_note TEXT NULL,
  decided_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_requests_type_check CHECK (leave_type IN ('sick', 'casual')),
  CONSTRAINT leave_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT leave_requests_date_check CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS leave_requests_user_idx
  ON leave_requests (user_id, from_date, to_date);

CREATE INDEX IF NOT EXISTS leave_requests_manager_idx
  ON leave_requests (manager_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS leave_requests_month_status_idx
  ON leave_requests (status, from_date, to_date);
