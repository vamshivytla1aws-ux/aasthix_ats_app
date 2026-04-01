-- AI screening workflow: secure test delivery + evaluation storage
BEGIN;

-- Add new safe stage that avoids direct rejection after screening.
ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_stage_check;

ALTER TABLE applications
  ADD CONSTRAINT applications_stage_check
  CHECK (stage IN ('Applied', 'Screening', 'Screening Failed', 'Interview', 'Selected', 'Rejected'));

CREATE TABLE IF NOT EXISTS screening_tests (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL,
  candidate_id BIGINT NOT NULL,
  job_id BIGINT NOT NULL,
  created_by_user_id BIGINT,
  access_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  score INT,
  feedback TEXT,
  strengths TEXT,
  weaknesses TEXT,
  quality_flag TEXT,
  ai_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT screening_tests_application_id_fkey
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  CONSTRAINT screening_tests_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  CONSTRAINT screening_tests_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT screening_tests_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT screening_tests_status_check
    CHECK (status IN ('pending', 'submitted', 'expired')),
  CONSTRAINT screening_tests_quality_flag_check
    CHECK (quality_flag IS NULL OR quality_flag IN ('high-quality', 'average', 'weak'))
);

CREATE INDEX IF NOT EXISTS screening_tests_application_idx
  ON screening_tests(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS screening_tests_candidate_idx
  ON screening_tests(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS screening_tests_status_idx
  ON screening_tests(status, expires_at);

CREATE TABLE IF NOT EXISTS screening_test_questions (
  id BIGSERIAL PRIMARY KEY,
  test_id BIGINT NOT NULL,
  question_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT screening_test_questions_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES screening_tests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS screening_test_questions_test_idx
  ON screening_test_questions(test_id, sort_order, id);

CREATE TABLE IF NOT EXISTS screening_test_answers (
  id BIGSERIAL PRIMARY KEY,
  test_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT screening_test_answers_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES screening_tests(id) ON DELETE CASCADE,
  CONSTRAINT screening_test_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES screening_test_questions(id) ON DELETE CASCADE,
  CONSTRAINT screening_test_answers_test_question_unique UNIQUE (test_id, question_id)
);

CREATE INDEX IF NOT EXISTS screening_test_answers_test_idx
  ON screening_test_answers(test_id, question_id);

COMMIT;
