BEGIN;

ALTER TABLE chat_policies
  ADD COLUMN IF NOT EXISTS call_start_scope TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS call_share_scope TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS max_call_participants INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS allow_external_live_calls BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_policies_call_start_scope_chk'
  ) THEN
    ALTER TABLE chat_policies
      ADD CONSTRAINT chat_policies_call_start_scope_chk
      CHECK (call_start_scope IN ('all', 'manager_plus', 'admin_plus'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_policies_call_share_scope_chk'
  ) THEN
    ALTER TABLE chat_policies
      ADD CONSTRAINT chat_policies_call_share_scope_chk
      CHECK (call_share_scope IN ('all', 'host_only', 'host_manager'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS chat_call_events (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES chat_call_rooms(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_call_events_room ON chat_call_events (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_call_events_type ON chat_call_events (event_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_call_events_key_unique
  ON chat_call_events (event_key)
  WHERE event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_call_removed_participants (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES chat_call_rooms(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  removed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_call_signals_type_chk'
  ) THEN
    ALTER TABLE chat_call_signals DROP CONSTRAINT chat_call_signals_type_chk;
  END IF;
END $$;

ALTER TABLE chat_call_signals
  ADD CONSTRAINT chat_call_signals_type_chk
  CHECK (signal_type IN ('offer', 'answer', 'ice', 'leave', 'presenting', 'moderation_mute', 'moderation_remove', 'moderation_end'));

COMMIT;
