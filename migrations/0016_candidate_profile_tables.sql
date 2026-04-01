-- Candidate profile support tables: activity timeline and notes
BEGIN;

CREATE TABLE IF NOT EXISTS candidate_activity (
  id BIGSERIAL PRIMARY KEY,
  candidate_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_activity_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS candidate_activity_candidate_created_idx
  ON candidate_activity(candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_notes (
  id BIGSERIAL PRIMARY KEY,
  candidate_id BIGINT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_notes_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS candidate_notes_candidate_created_idx
  ON candidate_notes(candidate_id, created_at DESC);

COMMIT;

