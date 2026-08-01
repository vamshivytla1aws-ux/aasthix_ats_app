BEGIN;

CREATE TABLE IF NOT EXISTS ai_interviews (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  secure_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  title TEXT NOT NULL,
  instructions TEXT,
  difficulty TEXT NOT NULL DEFAULT 'MIXED',
  skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  question_count INTEGER NOT NULL DEFAULT 7,
  duration_minutes INTEGER NOT NULL DEFAULT 40,
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  look_away_warning_limit INTEGER NOT NULL DEFAULT 5,
  tab_switch_warning_limit INTEGER NOT NULL DEFAULT 3,
  face_missing_threshold_seconds INTEGER NOT NULL DEFAULT 5,
  camera_required BOOLEAN NOT NULL DEFAULT TRUE,
  microphone_required BOOLEAN NOT NULL DEFAULT TRUE,
  recording_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  screen_share_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  fullscreen_required BOOLEAN NOT NULL DEFAULT TRUE,
  face_monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  gaze_monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  allow_system_check_retry BOOLEAN NOT NULL DEFAULT TRUE,
  overall_score NUMERIC(5,2),
  technical_score NUMERIC(5,2),
  communication_score NUMERIC(5,2),
  experience_relevance_score NUMERIC(5,2),
  integrity_risk TEXT,
  ai_recommendation TEXT,
  recruiter_decision TEXT,
  recruiter_comments TEXT,
  video_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  recording_path TEXT,
  recording_mime_type TEXT,
  recording_size BIGINT,
  recording_duration_seconds INTEGER,
  transcription_status TEXT NOT NULL DEFAULT 'PENDING',
  evaluation_status TEXT NOT NULL DEFAULT 'PENDING',
  processing_error TEXT,
  token_revoked_at TIMESTAMPTZ,
  invitation_sent_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_interviews_status_check CHECK (status IN (
    'DRAFT','SCHEDULED','READY','IN_PROGRESS','PROCESSING','COMPLETED','EXPIRED','CANCELLED','FAILED'
  )),
  CONSTRAINT ai_interviews_difficulty_check CHECK (difficulty IN ('BEGINNER','INTERMEDIATE','ADVANCED','MIXED')),
  CONSTRAINT ai_interviews_video_status_check CHECK (video_status IN (
    'NOT_STARTED','UPLOADING','UPLOADED','INCOMPLETE','DELETED_BY_RETENTION','DELETED_BY_RECRUITER','FAILED'
  )),
  CONSTRAINT ai_interviews_transcription_status_check CHECK (transcription_status IN ('PENDING','PROCESSING','COMPLETED','FAILED','RETRYING')),
  CONSTRAINT ai_interviews_evaluation_status_check CHECK (evaluation_status IN ('PENDING','PROCESSING','COMPLETED','FAILED','RETRYING')),
  CONSTRAINT ai_interviews_question_count_check CHECK (question_count BETWEEN 1 AND 20),
  CONSTRAINT ai_interviews_duration_check CHECK (duration_minutes BETWEEN 5 AND 180)
);

CREATE INDEX IF NOT EXISTS ai_interviews_creator_created_idx ON ai_interviews(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interviews_candidate_idx ON ai_interviews(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interviews_job_idx ON ai_interviews(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interviews_application_idx ON ai_interviews(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_interviews_status_idx ON ai_interviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interviews_token_hash_idx ON ai_interviews(secure_token_hash);

CREATE TABLE IF NOT EXISTS ai_interview_questions (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  skill_name TEXT,
  difficulty TEXT NOT NULL DEFAULT 'INTERMEDIATE',
  expected_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  scoring_rubric_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 10,
  generated_by_ai BOOLEAN NOT NULL DEFAULT TRUE,
  follow_up_parent_question_id BIGINT REFERENCES ai_interview_questions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(interview_id, order_number),
  CONSTRAINT ai_interview_questions_difficulty_check CHECK (difficulty IN ('BEGINNER','INTERMEDIATE','ADVANCED'))
);

CREATE INDEX IF NOT EXISTS ai_interview_questions_interview_idx ON ai_interview_questions(interview_id, order_number);

CREATE TABLE IF NOT EXISTS ai_interview_answers (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES ai_interview_questions(id) ON DELETE CASCADE,
  answer_started_at TIMESTAMPTZ,
  answer_completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'PENDING',
  answer_audio_path TEXT,
  answer_video_start_seconds INTEGER,
  answer_video_end_seconds INTEGER,
  score NUMERIC(6,2),
  strengths_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluator_feedback TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(interview_id, question_id),
  UNIQUE(interview_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_interview_answers_interview_idx ON ai_interview_answers(interview_id, question_id);

CREATE TABLE IF NOT EXISTS ai_interview_events (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  occurred_at TIMESTAMPTZ NOT NULL,
  duration_seconds NUMERIC(10,2),
  question_id BIGINT REFERENCES ai_interview_questions(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_timestamp_seconds NUMERIC(10,2),
  warning_number INTEGER,
  deduplication_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(interview_id, deduplication_key)
);

CREATE INDEX IF NOT EXISTS ai_interview_events_interview_time_idx ON ai_interview_events(interview_id, occurred_at);
CREATE INDEX IF NOT EXISTS ai_interview_events_type_idx ON ai_interview_events(interview_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS ai_interview_consents (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL UNIQUE REFERENCES ai_interviews(id) ON DELETE CASCADE,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  consent_text_hash TEXT NOT NULL,
  camera_consent BOOLEAN NOT NULL,
  microphone_consent BOOLEAN NOT NULL,
  recording_consent BOOLEAN NOT NULL,
  screen_share_consent BOOLEAN NOT NULL,
  monitoring_consent BOOLEAN NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_interview_evaluations (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  evaluation_version TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  technical_score NUMERIC(5,2) NOT NULL,
  communication_score NUMERIC(5,2) NOT NULL,
  experience_relevance_score NUMERIC(5,2) NOT NULL,
  overall_score NUMERIC(5,2) NOT NULL,
  strengths_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  concerns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  raw_response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_interview_evaluations_interview_idx ON ai_interview_evaluations(interview_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_interview_recording_chunks (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(interview_id, upload_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS ai_interview_recording_chunks_upload_idx ON ai_interview_recording_chunks(interview_id, upload_id, sequence_number);

CREATE TABLE IF NOT EXISTS ai_interview_audit_events (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_interview_audit_interview_idx ON ai_interview_audit_events(interview_id, created_at DESC);

COMMIT;
