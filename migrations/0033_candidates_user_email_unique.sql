-- Scope candidate email uniqueness per user/tenant.
-- This prevents cross-user conflicts and allows re-adding deleted candidates safely.

ALTER TABLE candidates
  DROP CONSTRAINT IF EXISTS candidates_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_user_email_unique
  ON candidates (created_by_user_id, email);
