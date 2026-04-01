-- Interview operations metadata for enterprise interview board

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS interview_reschedule_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS interview_cancel_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS interview_no_show BOOLEAN NOT NULL DEFAULT FALSE;
