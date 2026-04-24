BEGIN;

ALTER TABLE user_calendar_connections
  ADD COLUMN IF NOT EXISTS is_shared_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_calendar_connections
  ADD COLUMN IF NOT EXISTS account_email TEXT;

ALTER TABLE user_calendar_connections
  ADD COLUMN IF NOT EXISTS account_name TEXT;

ALTER TABLE user_calendar_connections
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_calendar_connections_shared_provider
  ON user_calendar_connections (provider)
  WHERE is_shared_account = TRUE;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS interview_attendee_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS calendar_provider TEXT;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS external_calendar_event_id TEXT;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS meet_link TEXT;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS calendar_organizer_email TEXT;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS calendar_last_synced_at TIMESTAMPTZ;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS calendar_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_external_calendar_event_id
  ON applications (external_calendar_event_id)
  WHERE external_calendar_event_id IS NOT NULL;

COMMIT;
