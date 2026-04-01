-- Add interview reminder_sent to prevent duplicate emails
BEGIN;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS applications_reminder_sent_idx ON applications(reminder_sent);
CREATE INDEX IF NOT EXISTS applications_interview_datetime_idx2 ON applications(interview_datetime);

COMMIT;

