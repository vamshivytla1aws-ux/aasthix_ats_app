-- Add invoice_days to vendors
BEGIN;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS invoice_days TEXT;

CREATE INDEX IF NOT EXISTS vendors_invoice_days_idx ON vendors(invoice_days);

COMMIT;

