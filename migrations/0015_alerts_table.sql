-- Global alerts for a user's dashboard (e.g., interview reminders/updates)
BEGIN;

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  application_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alerts_user_application_type_unique
    UNIQUE (user_id, application_id, type),
  CONSTRAINT alerts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT alerts_application_id_fkey
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS alerts_user_created_at_idx
  ON alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS alerts_user_unread_idx
  ON alerts(user_id, created_at DESC)
  WHERE read_at IS NULL;

COMMIT;

