-- Vendors (Client) management fields
BEGIN;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS commercials TEXT,
  ADD COLUMN IF NOT EXISTS invoice_agreement BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS remarks TEXT;

CREATE INDEX IF NOT EXISTS vendors_status_idx ON vendors(status);
CREATE INDEX IF NOT EXISTS vendors_industry_idx ON vendors(industry);

COMMIT;

