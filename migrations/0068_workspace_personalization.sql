BEGIN;

CREATE TABLE IF NOT EXISTS workspace_user_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_landing TEXT,
  density TEXT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  widget_pins JSONB NOT NULL DEFAULT '[]'::jsonb,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_role_defaults (
  role TEXT PRIMARY KEY,
  default_landing TEXT,
  density TEXT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  widget_pins JSONB NOT NULL DEFAULT '[]'::jsonb,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workspace_role_defaults (role, default_landing, density, scope, filters, widget_pins, layout)
VALUES
  ('admin', '/dashboard', 'compact', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
  ('recruiter', '/dashboard', 'compact', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
  ('hiring_manager', '/dashboard', 'comfortable', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
  ('coordinator', '/dashboard', 'compact', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
  ('employee', '/dashboard', 'comfortable', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
  ('user', '/dashboard', 'comfortable', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (role) DO NOTHING;

COMMIT;
