ALTER TABLE application_onboarding_documents
  ADD COLUMN IF NOT EXISTS file_blob BYTEA NULL;

