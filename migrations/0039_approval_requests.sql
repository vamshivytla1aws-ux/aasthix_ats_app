-- Minimal requisition approval workflow
-- Submit approval request → approver approves / rejects → job status auto-updates

BEGIN;

CREATE TABLE IF NOT EXISTS approval_requests (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  requester_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  approver_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  notes TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_requests_job_idx
  ON approval_requests (job_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS approval_requests_approver_idx
  ON approval_requests (approver_id, status) WHERE approver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS approval_requests_requester_idx
  ON approval_requests (requester_id, created_at DESC);

-- Add approvals.manage permission for seeded admin (idempotent)
INSERT INTO user_permissions (user_id, permission_key, allowed)
SELECT u.id, 'approvals.manage', true
FROM users u
WHERE u.role = 'admin'
ON CONFLICT DO NOTHING;

COMMIT;
