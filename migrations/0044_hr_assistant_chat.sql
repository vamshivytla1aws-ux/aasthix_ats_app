-- Per-user HR Assistant chat history (dashboard AI)

BEGIN;

CREATE TABLE IF NOT EXISTS hr_assistant_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_assistant_messages_user_created_idx
  ON hr_assistant_messages (user_id, created_at DESC);

COMMIT;
