BEGIN;

CREATE TABLE IF NOT EXISTS job_interview_questions (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('technical', 'scenario', 'behavioral', 'hr')),
  question TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_interview_questions_job
  ON job_interview_questions(job_id, category, sort_order, id);

CREATE TABLE IF NOT EXISTS application_interview_question_feedback (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES job_interview_questions(id) ON DELETE CASCADE,
  asked BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_app_question_feedback_app
  ON application_interview_question_feedback(application_id, question_id);

COMMIT;
