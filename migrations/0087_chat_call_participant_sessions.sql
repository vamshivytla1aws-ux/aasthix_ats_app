ALTER TABLE chat_call_participants
  ADD COLUMN IF NOT EXISTS session_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS livekit_identity TEXT NULL,
  ADD COLUMN IF NOT EXISTS client_kind TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NULL;

UPDATE chat_call_participants
SET
  session_id = COALESCE(session_id, CONCAT('legacy-user-', user_id::text)),
  client_kind = COALESCE(client_kind, 'legacy'),
  last_seen_at = COALESCE(last_seen_at, joined_at)
WHERE session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_call_participants_active_session
  ON chat_call_participants (room_id, user_id, session_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_call_participants_last_seen
  ON chat_call_participants (room_id, last_seen_at DESC)
  WHERE left_at IS NULL;
