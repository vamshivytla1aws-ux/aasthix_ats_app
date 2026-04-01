BEGIN;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS agreement_start_date DATE,
  ADD COLUMN IF NOT EXISTS agreement_end_date DATE,
  ADD COLUMN IF NOT EXISTS renewal_notice_days INT NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS client_contacts (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  designation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_contacts_client_idx
  ON client_contacts(client_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS client_renewal_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  agreement_end_date DATE NOT NULL,
  notice_days INT NOT NULL DEFAULT 30,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CONSTRAINT client_renewal_alerts_unique UNIQUE (user_id, client_id, agreement_end_date)
);

CREATE INDEX IF NOT EXISTS client_renewal_alerts_user_created_idx
  ON client_renewal_alerts(user_id, created_at DESC);

COMMIT;
