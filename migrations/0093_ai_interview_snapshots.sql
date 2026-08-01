BEGIN;

ALTER TABLE ai_interviews
  ADD COLUMN IF NOT EXISTS snapshot_status TEXT NOT NULL DEFAULT 'NOT_CAPTURED',
  ADD COLUMN IF NOT EXISTS snapshot_path TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_size BIGINT,
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_interviews_snapshot_status_check'
  ) THEN
    ALTER TABLE ai_interviews
      ADD CONSTRAINT ai_interviews_snapshot_status_check
      CHECK (snapshot_status IN ('NOT_CAPTURED','CAPTURED','FAILED'));
  END IF;
END $$;

COMMIT;
