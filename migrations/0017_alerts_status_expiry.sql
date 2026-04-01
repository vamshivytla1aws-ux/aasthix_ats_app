-- Add status + expiry lifecycle support for alerts
BEGIN;

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unread',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill existing rows
UPDATE alerts
SET status = CASE
  WHEN read_at IS NOT NULL THEN 'read'
  ELSE 'unread'
END
WHERE status IS NULL OR status NOT IN ('unread', 'read', 'expired');

UPDATE alerts
SET expires_at = COALESCE(expires_at, created_at + INTERVAL '2 hour');

CREATE INDEX IF NOT EXISTS alerts_status_expires_idx
  ON alerts(user_id, status, expires_at DESC);

COMMIT;

