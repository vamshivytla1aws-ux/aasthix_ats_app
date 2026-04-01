-- Add password hash for authentication
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMIT;

