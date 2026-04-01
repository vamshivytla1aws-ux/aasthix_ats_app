-- Invites, security audit log, and backfill explicit permissions for non-admins
-- (so default-deny + role baselines do not lock out existing users).
BEGIN;

CREATE TABLE IF NOT EXISTS user_invites (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_invites_email_lower_idx
  ON user_invites (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS user_invites_one_pending_email
  ON user_invites (lower(email))
  WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS app_audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_audit_events_action_created_idx
  ON app_audit_events (action, created_at DESC);

CREATE INDEX IF NOT EXISTS app_audit_events_actor_created_idx
  ON app_audit_events (actor_user_id, created_at DESC);

-- Preserve current effective access: non-admins previously had implicit allow-all.
INSERT INTO user_permissions (user_id, permission_key, allowed)
SELECT u.id, k.key, TRUE
FROM users u
CROSS JOIN (
  VALUES
    ('dashboard.view'),
    ('candidates.view'),
    ('candidates.manage'),
    ('jobs.view'),
    ('jobs.manage'),
    ('pipeline.view'),
    ('pipeline.manage'),
    ('interviews.view'),
    ('interviews.manage'),
    ('vendors.view'),
    ('vendors.manage'),
    ('alerts.view'),
    ('approvals.manage'),
    ('hiring_manager.view'),
    ('recruiter.view'),
    ('coordinator.view'),
    ('chat.view')
) AS k(key)
WHERE lower(coalesce(u.role, 'user')) <> 'admin'
ON CONFLICT (user_id, permission_key) DO NOTHING;

COMMIT;
