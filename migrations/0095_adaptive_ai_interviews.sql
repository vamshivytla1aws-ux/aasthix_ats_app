BEGIN;

ALTER TABLE ai_interviews
  ADD COLUMN IF NOT EXISTS interview_mode TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS interview_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS adaptive_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skill_coverage_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS adaptive_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS context_source_quality TEXT;

DO $$ BEGIN
  ALTER TABLE ai_interviews ADD CONSTRAINT ai_interviews_mode_check CHECK (interview_mode IN ('ADAPTIVE','FIXED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ai_interviews ALTER COLUMN interview_mode SET DEFAULT 'ADAPTIVE';

ALTER TABLE ai_interview_questions
  ADD COLUMN IF NOT EXISTS adaptive_strategy TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS reason_for_asking TEXT,
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS expected_signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS adaptive_depth TEXT,
  ADD COLUMN IF NOT EXISTS runtime_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS triggering_answer_id BIGINT REFERENCES ai_interview_answers(id) ON DELETE SET NULL;

ALTER TABLE ai_interview_answers
  ADD COLUMN IF NOT EXISTS adaptive_analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ai_interviews_mode_status_idx ON ai_interviews(interview_mode,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interview_questions_runtime_idx ON ai_interview_questions(interview_id,runtime_generated,order_number);

COMMIT;
