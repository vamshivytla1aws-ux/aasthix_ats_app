BEGIN;

ALTER TABLE job_interview_questions
  ADD COLUMN IF NOT EXISTS reference_answer TEXT;

COMMIT;

