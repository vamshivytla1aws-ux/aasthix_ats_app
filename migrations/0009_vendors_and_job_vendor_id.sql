-- Vendors module: vendors table + jobs.vendor_id
BEGIN;

CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_by_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vendors_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS vendors_created_by_user_id_idx ON vendors(created_by_user_id);
CREATE INDEX IF NOT EXISTS vendors_name_idx ON vendors(name);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS vendor_id BIGINT;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_vendor_id_idx ON jobs(vendor_id);

COMMIT;

