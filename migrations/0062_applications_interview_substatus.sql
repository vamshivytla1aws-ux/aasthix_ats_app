BEGIN;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS interview_substatus TEXT,
  ADD COLUMN IF NOT EXISTS interview_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_status_note TEXT;

UPDATE applications
SET interview_substatus = CASE
  WHEN stage = 'Interview' AND COALESCE(interview_no_show, FALSE) = TRUE THEN 'no_show'
  WHEN stage = 'Interview' AND COALESCE(interview_scheduled, FALSE) = TRUE AND interview_datetime IS NOT NULL THEN 'scheduled'
  ELSE interview_substatus
END
WHERE interview_substatus IS NULL;

CREATE INDEX IF NOT EXISTS applications_interview_substatus_idx
  ON applications(interview_substatus, updated_at DESC);

COMMIT;
