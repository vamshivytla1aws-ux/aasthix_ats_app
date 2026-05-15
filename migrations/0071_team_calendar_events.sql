BEGIN;

CREATE TABLE IF NOT EXISTS team_calendar_events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  recurrence TEXT NOT NULL DEFAULT 'none',
  recurrence_until DATE,
  attendee_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  attendee_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  calendar_provider TEXT,
  external_calendar_event_id TEXT,
  meet_link TEXT,
  calendar_organizer_email TEXT,
  calendar_last_synced_at TIMESTAMPTZ,
  calendar_sync_status TEXT,
  calendar_sync_error TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_calendar_events_recurrence_chk CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
  CONSTRAINT team_calendar_events_status_chk CHECK (status IN ('scheduled', 'updated', 'cancelled', 'sync_failed'))
);

CREATE INDEX IF NOT EXISTS idx_team_calendar_events_start_at
  ON team_calendar_events (start_at);

CREATE INDEX IF NOT EXISTS idx_team_calendar_events_status
  ON team_calendar_events (status);

CREATE INDEX IF NOT EXISTS idx_team_calendar_events_external_event_id
  ON team_calendar_events (external_calendar_event_id)
  WHERE external_calendar_event_id IS NOT NULL;

COMMIT;
