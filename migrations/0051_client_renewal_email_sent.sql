BEGIN;

CREATE TABLE IF NOT EXISTS client_renewal_email_sent (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  agreement_end_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_renewal_email_sent_unique UNIQUE (client_id, agreement_end_date)
);

CREATE INDEX IF NOT EXISTS client_renewal_email_sent_end_idx
  ON client_renewal_email_sent(agreement_end_date DESC, sent_at DESC);

COMMIT;
