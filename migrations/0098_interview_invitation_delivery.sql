BEGIN;

CREATE TABLE IF NOT EXISTS interview_invitation_deliveries (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  invite_mode TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  recipient_hash TEXT,
  subject_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  delivery_channel TEXT,
  calendar_sync_status TEXT,
  email_send_status TEXT,
  email_provider TEXT,
  provider_message_id TEXT,
  external_calendar_event_id TEXT,
  meet_link TEXT,
  error_category TEXT,
  error_detail TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (application_id, idempotency_key),
  CONSTRAINT interview_invitation_deliveries_mode_check CHECK (invite_mode IN ('scheduled', 'rescheduled')),
  CONSTRAINT interview_invitation_deliveries_status_check CHECK (status IN ('pending', 'sent', 'sent_with_warning', 'failed'))
);

CREATE INDEX IF NOT EXISTS interview_invitation_deliveries_application_idx
  ON interview_invitation_deliveries (application_id, created_at DESC);

COMMIT;
