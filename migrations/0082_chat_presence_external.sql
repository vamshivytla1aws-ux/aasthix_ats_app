-- Chat presence + temporary external guest access

ALTER TABLE chat_user_preferences
  ADD COLUMN IF NOT EXISTS manual_presence TEXT NOT NULL DEFAULT 'available'
  CHECK (manual_presence IN ('available', 'busy'));

CREATE TABLE IF NOT EXISTS chat_external_invites (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  created_by BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  external_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_external_invites_conversation
  ON chat_external_invites (conversation_id);

