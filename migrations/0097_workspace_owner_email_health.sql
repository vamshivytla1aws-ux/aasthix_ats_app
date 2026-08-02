BEGIN;

ALTER TABLE user_invites
  ADD COLUMN IF NOT EXISTS permission_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS email_delivery_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  sender_domain TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_category TEXT,
  error_detail TEXT,
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_delivery_events_status_check CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS email_delivery_events_created_idx
  ON email_delivery_events (created_at DESC);

-- Preserve existing administrator visibility while access scopes become enforceable.
UPDATE users SET access_scope = 'all' WHERE lower(role) IN ('admin', 'administrator');

COMMIT;
