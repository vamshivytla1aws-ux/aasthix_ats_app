CREATE TABLE IF NOT EXISTS ai_interview_incident_snapshots (
  id SERIAL PRIMARY KEY,
  interview_id INT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  snapshot_path VARCHAR(1024) NOT NULL,
  snapshot_mime_type VARCHAR(128) NOT NULL,
  snapshot_size BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_interview_incident_snapshots_interview_id ON ai_interview_incident_snapshots(interview_id);
