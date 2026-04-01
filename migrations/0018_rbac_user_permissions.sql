BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

UPDATE users
SET role = 'user'
WHERE role IS NULL OR role = '' OR role = 'member';

UPDATE users u
SET role = 'admin'
WHERE u.id = (
  SELECT id
  FROM users
  ORDER BY created_at ASC, id ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM users WHERE role = 'admin'
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_permissions_unique UNIQUE (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS user_permissions_user_id_idx
  ON user_permissions(user_id);

CREATE INDEX IF NOT EXISTS user_permissions_key_idx
  ON user_permissions(permission_key);

COMMIT;

