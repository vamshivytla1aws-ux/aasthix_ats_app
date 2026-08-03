BEGIN;

CREATE TABLE IF NOT EXISTS ai_interview_desktop_snapshots (
  id SERIAL PRIMARY KEY,
  interview_id INT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  snapshot_path TEXT NOT NULL,
  snapshot_mime_type VARCHAR(100) NOT NULL,
  snapshot_size INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_interview_desktop_snapshots_interview_id_idx ON ai_interview_desktop_snapshots(interview_id);

ALTER TABLE ai_interviews ALTER COLUMN screen_share_enabled SET DEFAULT true;
UPDATE ai_interviews SET screen_share_enabled = true;

COMMIT;
