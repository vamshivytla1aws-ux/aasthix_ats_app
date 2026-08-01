BEGIN;

ALTER TABLE ai_interviews
  ADD COLUMN IF NOT EXISTS question_generation_model TEXT,
  ADD COLUMN IF NOT EXISTS evaluation_model TEXT,
  ADD COLUMN IF NOT EXISTS transcription_model TEXT,
  ADD COLUMN IF NOT EXISTS fallback_review_used BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ai_interview_answers
  ADD COLUMN IF NOT EXISTS answer_audio_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS answer_audio_size BIGINT,
  ADD COLUMN IF NOT EXISTS transcription_model TEXT,
  ADD COLUMN IF NOT EXISTS evaluation_model TEXT;

COMMIT;
