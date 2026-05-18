-- Chat V2 collaboration primitives

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_state TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_state IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idempotency_key
  ON messages (conversation_id, sender_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_reactions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions (message_id);

CREATE TABLE IF NOT EXISTS conversation_pins (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  pinned_by BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS chat_user_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  mention_only BOOLEAN NOT NULL DEFAULT FALSE,
  desktop_sound BOOLEAN NOT NULL DEFAULT TRUE,
  desktop_toast BOOLEAN NOT NULL DEFAULT TRUE,
  email_digest BOOLEAN NOT NULL DEFAULT FALSE,
  email_digest_frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (email_digest_frequency IN ('off', 'daily', 'weekly')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_conversation_preferences (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  mention_only BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_policies (
  id BIGSERIAL PRIMARY KEY,
  retention_days INTEGER NOT NULL DEFAULT 365,
  allow_message_edit BOOLEAN NOT NULL DEFAULT TRUE,
  allow_message_delete BOOLEAN NOT NULL DEFAULT TRUE,
  allow_export BOOLEAN NOT NULL DEFAULT FALSE,
  max_file_size_mb INTEGER NOT NULL DEFAULT 10,
  allowed_mime_categories TEXT[] NOT NULL DEFAULT ARRAY['image', 'document', 'archive'],
  updated_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO chat_policies (retention_days, allow_message_edit, allow_message_delete, allow_export, max_file_size_mb)
SELECT 365, TRUE, TRUE, FALSE, 10
WHERE NOT EXISTS (SELECT 1 FROM chat_policies);

