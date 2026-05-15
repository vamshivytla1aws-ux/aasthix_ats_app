-- Selected-stage onboarding packets (per application)

CREATE TABLE IF NOT EXISTS application_onboarding_packets (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  sent_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('not_sent', 'sent', 'in_progress', 'submitted', 'exported', 'revoked', 'expired')),
  note TEXT,
  deadline_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NULL,
  exported_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS application_onboarding_packets_token_uidx
  ON application_onboarding_packets(access_token);

CREATE INDEX IF NOT EXISTS application_onboarding_packets_application_idx
  ON application_onboarding_packets(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS application_onboarding_packets_candidate_idx
  ON application_onboarding_packets(candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_onboarding_payloads (
  id BIGSERIAL PRIMARY KEY,
  packet_id BIGINT NOT NULL REFERENCES application_onboarding_packets(id) ON DELETE CASCADE,
  payload_version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS application_onboarding_payloads_packet_idx
  ON application_onboarding_payloads(packet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_onboarding_documents (
  id BIGSERIAL PRIMARY KEY,
  packet_id BIGINT NOT NULL REFERENCES application_onboarding_packets(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime TEXT NULL,
  size_bytes BIGINT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS application_onboarding_documents_packet_idx
  ON application_onboarding_documents(packet_id, uploaded_at DESC);
