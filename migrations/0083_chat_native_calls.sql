BEGIN;

CREATE TABLE IF NOT EXISTS chat_call_rooms (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'call',
  status TEXT NOT NULL DEFAULT 'scheduled',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  join_url TEXT,
  provider TEXT NOT NULL DEFAULT 'ats_native',
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ended_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT chat_call_rooms_mode_chk CHECK (mode IN ('call', 'screenshare')),
  CONSTRAINT chat_call_rooms_status_chk CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled')),
  CONSTRAINT chat_call_rooms_provider_chk CHECK (provider IN ('ats_native'))
);

CREATE INDEX IF NOT EXISTS idx_chat_call_rooms_conversation_start
  ON chat_call_rooms (conversation_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_call_rooms_status
  ON chat_call_rooms (status, start_at DESC);

CREATE TABLE IF NOT EXISTS chat_call_participants (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES chat_call_rooms(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  external_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_presenting BOOLEAN NOT NULL DEFAULT FALSE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  camera_off BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_chat_call_participants_room
  ON chat_call_participants (room_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS chat_call_signals (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES chat_call_rooms(id) ON DELETE CASCADE,
  from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  CONSTRAINT chat_call_signals_type_chk CHECK (signal_type IN ('offer', 'answer', 'ice', 'leave', 'presenting'))
);

CREATE INDEX IF NOT EXISTS idx_chat_call_signals_room_target
  ON chat_call_signals (room_id, to_user_id, consumed_at, created_at);

COMMIT;

