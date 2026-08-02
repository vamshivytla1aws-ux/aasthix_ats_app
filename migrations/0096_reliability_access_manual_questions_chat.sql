BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS access_scope TEXT NOT NULL DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_login_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_access_scope_check
    CHECK (access_scope IN ('own','team','all'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE user_invites
  ADD COLUMN IF NOT EXISTS access_scope TEXT NOT NULL DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_provider TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE user_invites ADD CONSTRAINT user_invites_access_scope_check
    CHECK (access_scope IN ('own','team','all'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS user_invites_status_idx
  ON user_invites (revoked_at, accepted_at, expires_at, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_interview_recruiter_questions (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  skill_name TEXT NOT NULL DEFAULT 'General',
  difficulty TEXT NOT NULL DEFAULT 'INTERMEDIATE',
  expected_signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  scoring_rubric_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 10,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  consumed_question_id BIGINT REFERENCES ai_interview_questions(id) ON DELETE SET NULL,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (interview_id, sort_order),
  CONSTRAINT ai_interview_recruiter_questions_difficulty_check
    CHECK (difficulty IN ('BEGINNER','INTERMEDIATE','ADVANCED'))
);

CREATE INDEX IF NOT EXISTS ai_interview_recruiter_questions_pending_idx
  ON ai_interview_recruiter_questions (interview_id, consumed_question_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_desc
  ON messages (conversation_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_root_conversation_id_desc
  ON messages (conversation_id, id DESC) WHERE parent_message_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_unread_created
  ON messages (conversation_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_conversation_read
  ON conversation_members (user_id, conversation_id, last_read_at);

COMMIT;
