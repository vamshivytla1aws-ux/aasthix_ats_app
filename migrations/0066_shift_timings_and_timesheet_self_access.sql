BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS shift_start_time_local TEXT NULL,
  ADD COLUMN IF NOT EXISTS shift_grace_minutes INT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_shift_start_time_local_format'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_shift_start_time_local_format
      CHECK (shift_start_time_local IS NULL OR shift_start_time_local ~ '^[0-2][0-9]:[0-5][0-9]$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_shift_grace_minutes_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_shift_grace_minutes_check
      CHECK (shift_grace_minutes IS NULL OR (shift_grace_minutes >= 0 AND shift_grace_minutes <= 240));
  END IF;
END $$;

INSERT INTO user_permissions (user_id, permission_key, allowed)
SELECT u.id, p.permission_key, TRUE
FROM users u
CROSS JOIN (VALUES ('timesheet.view_self'::text), ('timesheet.manage_self'::text)) AS p(permission_key)
WHERE LOWER(COALESCE(u.role, 'user')) IN ('user', 'employee', 'recruiter', 'hiring_manager', 'coordinator')
ON CONFLICT (user_id, permission_key)
DO UPDATE SET
  allowed = TRUE,
  updated_at = NOW();

COMMIT;
