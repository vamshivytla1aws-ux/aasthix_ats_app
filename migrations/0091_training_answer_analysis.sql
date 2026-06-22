ALTER TABLE training_submissions
  ADD COLUMN IF NOT EXISTS trainee_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS answer_analyses JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS answer_analysis_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS answer_analysis_error TEXT,
  ADD COLUMN IF NOT EXISTS answer_analysis_mode TEXT,
  ADD COLUMN IF NOT EXISTS overall_answer_score INTEGER,
  ADD COLUMN IF NOT EXISTS answer_summary TEXT,
  ADD COLUMN IF NOT EXISTS answers_submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_training_submissions_answers_submitted_at
  ON training_submissions (answers_submitted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_training_submissions_answer_analysis_status
  ON training_submissions (answer_analysis_status);
