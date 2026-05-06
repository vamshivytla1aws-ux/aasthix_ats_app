BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS attendance_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS attendance_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  company_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  start_time_local TEXT NOT NULL DEFAULT '09:30',
  grace_minutes INT NOT NULL DEFAULT 15,
  working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_settings_singleton CHECK (id = 1),
  CONSTRAINT attendance_settings_start_time_format CHECK (start_time_local ~ '^[0-2][0-9]:[0-5][0-9]$'),
  CONSTRAINT attendance_settings_grace_minutes_check CHECK (grace_minutes >= 0 AND grace_minutes <= 240)
);

INSERT INTO attendance_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL,
  first_check_in_at TIMESTAMPTZ NULL,
  last_check_out_at TIMESTAMPTZ NULL,
  total_minutes INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'self',
  admin_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_records_status_check CHECK (status IN ('present', 'late', 'absent')),
  CONSTRAINT attendance_records_source_check CHECK (source IN ('self', 'admin', 'system')),
  CONSTRAINT attendance_records_total_minutes_check CHECK (total_minutes >= 0),
  CONSTRAINT attendance_records_user_date_unique UNIQUE (user_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS attendance_records_date_idx
ON attendance_records(attendance_date DESC, status);

CREATE INDEX IF NOT EXISTS attendance_records_user_idx
ON attendance_records(user_id, attendance_date DESC);

COMMIT;
