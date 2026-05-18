-- Add lightweight single-level thread support for chat messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS parent_message_id BIGINT REFERENCES messages (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_parent_message_id ON messages (parent_message_id);
