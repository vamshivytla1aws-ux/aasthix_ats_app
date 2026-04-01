-- Store extracted resume plain text for enterprise JD↔resume matching (OpenAI + offline fallbacks).
BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS resume_text TEXT;

COMMIT;
