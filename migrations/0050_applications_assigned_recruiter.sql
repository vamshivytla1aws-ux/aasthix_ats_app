-- Owner / accountable recruiter on pipeline cards (single-tenant).
BEGIN;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS assigned_recruiter_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS applications_assigned_recruiter_idx
  ON applications(assigned_recruiter_user_id)
  WHERE assigned_recruiter_user_id IS NOT NULL;

COMMIT;
