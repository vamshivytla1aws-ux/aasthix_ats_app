CREATE TABLE IF NOT EXISTS message_mentions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'candidate')),
  entity_id BIGINT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_mentions_message_id ON message_mentions (message_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_entity ON message_mentions (entity_type, entity_id);
