-- Salary structure + payslip module

CREATE TABLE IF NOT EXISTS salary_settings (
  id BIGSERIAL PRIMARY KEY,
  monthly_rounding_mode TEXT NOT NULL DEFAULT 'two_decimals' CHECK (monthly_rounding_mode IN ('two_decimals', 'nearest_rupee')),
  professional_tax_default NUMERIC(12,2) NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_component_configs (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN ('earning', 'deduction')),
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('percentage', 'fixed', 'formula', 'manual')),
  percentage_of_ctc NUMERIC(8,4) NULL,
  fixed_annual_amount NUMERIC(14,2) NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_structures (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  department TEXT NULL,
  designation TEXT NULL,
  date_of_joining DATE NULL,
  pan TEXT NULL,
  uan_number TEXT NULL,
  pf_number TEXT NULL,
  bank_account_number TEXT NULL,
  work_location TEXT NULL,
  ctc_annual NUMERIC(14,2) NOT NULL CHECK (ctc_annual > 0),
  salary_month DATE NOT NULL,
  total_paid_days NUMERIC(6,2) NOT NULL DEFAULT 30,
  lop_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  tax_regime TEXT NOT NULL DEFAULT 'new_regime' CHECK (tax_regime IN ('new_regime', 'old_regime', 'manual_tds')),
  manual_tds_annual NUMERIC(14,2) NULL,
  professional_tax_monthly NUMERIC(12,2) NOT NULL DEFAULT 200,
  pf_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  employer_pf_included_in_ctc BOOLEAN NOT NULL DEFAULT TRUE,
  employee_pf_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  health_insurance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  health_insurance_annual NUMERIC(14,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS salary_structures_employee_idx
  ON salary_structures(employee_id, effective_from DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS salary_components (
  id BIGSERIAL PRIMARY KEY,
  salary_structure_id BIGINT NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
  component_class TEXT NOT NULL CHECK (component_class IN ('earning', 'deduction')),
  name TEXT NOT NULL,
  component_code TEXT NULL,
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('percentage', 'fixed', 'formula', 'manual')),
  percentage_of_ctc NUMERIC(8,4) NULL,
  annual_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS salary_components_structure_idx
  ON salary_components(salary_structure_id, component_class, sort_order);

CREATE TABLE IF NOT EXISTS tax_configs (
  id BIGSERIAL PRIMARY KEY,
  financial_year TEXT NOT NULL,
  regime TEXT NOT NULL CHECK (regime IN ('new_regime', 'old_regime')),
  standard_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  rebate_threshold NUMERIC(14,2) NOT NULL DEFAULT 0,
  cess_percent NUMERIC(8,4) NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_configs_fy_regime_uidx
  ON tax_configs(financial_year, regime);

CREATE TABLE IF NOT EXISTS tax_slabs (
  id BIGSERIAL PRIMARY KEY,
  tax_config_id BIGINT NOT NULL REFERENCES tax_configs(id) ON DELETE CASCADE,
  min_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(14,2) NULL,
  rate_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS tax_slabs_config_idx
  ON tax_slabs(tax_config_id, sort_order, min_amount);

CREATE TABLE IF NOT EXISTS payslips (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  salary_structure_id BIGINT NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year >= 2000),
  paid_days NUMERIC(6,2) NOT NULL,
  lop_days NUMERIC(6,2) NOT NULL,
  gross_monthly NUMERIC(14,2) NOT NULL,
  total_deductions NUMERIC(14,2) NOT NULL,
  net_salary NUMERIC(14,2) NOT NULL,
  net_salary_words TEXT NOT NULL,
  pdf_url TEXT NULL,
  pdf_blob BYTEA NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payslips_employee_idx
  ON payslips(employee_id, year DESC, month DESC, generated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS payslips_employee_month_uidx
  ON payslips(employee_id, year, month);

CREATE TABLE IF NOT EXISTS payslip_line_items (
  id BIGSERIAL PRIMARY KEY,
  payslip_id BIGINT NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  item_class TEXT NOT NULL CHECK (item_class IN ('earning', 'deduction')),
  name TEXT NOT NULL,
  annual_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_for_month NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS payslip_line_items_idx
  ON payslip_line_items(payslip_id, item_class, sort_order);

INSERT INTO salary_settings (monthly_rounding_mode, professional_tax_default)
SELECT 'two_decimals', 200
WHERE NOT EXISTS (SELECT 1 FROM salary_settings);

INSERT INTO salary_component_configs (code, name, component_type, calculation_type, percentage_of_ctc, sort_order)
VALUES
  ('basic', 'Basic Salary', 'earning', 'percentage', 30, 10),
  ('hra', 'HRA', 'earning', 'percentage', 15, 20),
  ('special_allowance', 'Special Allowance', 'earning', 'percentage', 10, 30),
  ('conveyance', 'Conveyance Allowance', 'earning', 'percentage', 12, 40),
  ('employer_pf', 'Employer PF', 'deduction', 'fixed', NULL, 50),
  ('other_allowance', 'Other Allowance', 'earning', 'formula', NULL, 60),
  ('professional_tax', 'Professional Tax', 'deduction', 'fixed', NULL, 110),
  ('employee_pf', 'Employee PF', 'deduction', 'fixed', NULL, 120),
  ('tds', 'TDS', 'deduction', 'manual', NULL, 130),
  ('health_insurance', 'Health Insurance', 'deduction', 'manual', NULL, 140)
ON CONFLICT (code) DO NOTHING;

INSERT INTO tax_configs (financial_year, regime, standard_deduction, rebate_threshold, cess_percent, is_active)
VALUES
  ('FY 2025-26', 'new_regime', 75000, 1275000, 4, TRUE),
  ('FY 2025-26', 'old_regime', 50000, 500000, 4, TRUE)
ON CONFLICT (financial_year, regime) DO NOTHING;

INSERT INTO tax_slabs (tax_config_id, min_amount, max_amount, rate_percent, sort_order)
SELECT cfg.id, s.min_amount, s.max_amount, s.rate_percent, s.sort_order
FROM tax_configs cfg
JOIN (
  VALUES
    ('new_regime', 0::numeric, 400000::numeric, 0::numeric, 10),
    ('new_regime', 400001::numeric, 800000::numeric, 5::numeric, 20),
    ('new_regime', 800001::numeric, 1200000::numeric, 10::numeric, 30),
    ('new_regime', 1200001::numeric, 1600000::numeric, 15::numeric, 40),
    ('new_regime', 1600001::numeric, 2000000::numeric, 20::numeric, 50),
    ('new_regime', 2000001::numeric, 2400000::numeric, 25::numeric, 60),
    ('new_regime', 2400001::numeric, NULL::numeric, 30::numeric, 70),
    ('old_regime', 0::numeric, 250000::numeric, 0::numeric, 10),
    ('old_regime', 250001::numeric, 500000::numeric, 5::numeric, 20),
    ('old_regime', 500001::numeric, 1000000::numeric, 20::numeric, 30),
    ('old_regime', 1000001::numeric, NULL::numeric, 30::numeric, 40)
) AS s(regime, min_amount, max_amount, rate_percent, sort_order)
  ON cfg.regime = s.regime
WHERE cfg.financial_year = 'FY 2025-26'
  AND NOT EXISTS (
    SELECT 1 FROM tax_slabs t
    WHERE t.tax_config_id = cfg.id
  );
