-- Interview scheduling fields for applications
BEGIN;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS interview_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS interview_datetime TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS applications_interview_datetime_idx ON applications(interview_datetime);

COMMIT;

