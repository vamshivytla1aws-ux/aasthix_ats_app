BEGIN;

CREATE TABLE IF NOT EXISTS application_risk_insights (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  risk_type TEXT NOT NULL,
  risk_score INT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  confidence_band TEXT NOT NULL DEFAULT 'medium',
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL DEFAULT 'heuristic-v1',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, risk_type)
);

CREATE INDEX IF NOT EXISTS idx_application_risk_insights_application
  ON application_risk_insights(application_id);

CREATE TABLE IF NOT EXISTS job_risk_insights (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  risk_type TEXT NOT NULL,
  risk_score INT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  confidence_band TEXT NOT NULL DEFAULT 'medium',
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL DEFAULT 'heuristic-v1',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, risk_type)
);

CREATE INDEX IF NOT EXISTS idx_job_risk_insights_job
  ON job_risk_insights(job_id);

CREATE TABLE IF NOT EXISTS automation_rules (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'recommend-only',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT REFERENCES automation_rules(id) ON DELETE SET NULL,
  run_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  replay_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_created_at
  ON automation_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS interview_scorecard_templates (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  template JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_scorecards (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  round_label TEXT,
  scorecard JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_scorecards_application
  ON interview_scorecards(application_id);

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_type TEXT NOT NULL,
  snapshot_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_band TEXT NOT NULL DEFAULT 'medium',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO automation_rules (key, name, description, mode, enabled, paused, config)
VALUES
  ('stale_stage_followup', 'Stale stage follow-up', 'Create follow-up nudges when an application has no stage movement for N days.', 'recommend-only', TRUE, FALSE, '{"stale_days":7}'::jsonb),
  ('interview_risk_notify', 'Interview risk notify', 'Notify owner and panel when interview risk exceeds threshold.', 'recommend-only', TRUE, FALSE, '{"risk_threshold":70}'::jsonb),
  ('overload_reassignment', 'Recruiter overload rebalance', 'Suggest reassignment when recruiter load is significantly above team average.', 'recommend-only', TRUE, FALSE, '{"max_load_delta":6}'::jsonb),
  ('candidate_pending_nudge', 'Candidate pending nudge', 'Nudge candidates with pending actions after SLA window.', 'recommend-only', TRUE, FALSE, '{"pending_hours":48}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
