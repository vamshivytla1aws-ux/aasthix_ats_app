-- pgvector + resume/job embeddings for fast similarity search.
-- Requires PostgreSQL with the pgvector extension available (e.g. Neon, RDS, local with `CREATE EXTENSION`).
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS resume_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS resume_embedding_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_embedding_model TEXT;

CREATE TABLE IF NOT EXISTS job_embedding_cache (
  job_id BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_match_job_runs
  ADD COLUMN IF NOT EXISTS embedding_preview_json JSONB;

COMMIT;
