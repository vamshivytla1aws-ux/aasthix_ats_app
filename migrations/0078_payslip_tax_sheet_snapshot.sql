ALTER TABLE payslips
ADD COLUMN IF NOT EXISTS tax_sheet_snapshot JSONB NULL;

