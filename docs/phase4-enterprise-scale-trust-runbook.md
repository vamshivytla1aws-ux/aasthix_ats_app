# Phase 4: Enterprise Scale + Trust Layer Runbook

## Goal
Ship Phase 4 as an additive hardening release for governance, compliance, integrations, SRE operations, and AI governance with safe flag-based rollback.

## Feature Flags
- `ORG_GOVERNANCE_V4_ENABLED`
- `COMPLIANCE_V4_ENABLED`
- `INTEGRATIONS_V4_ENABLED`
- `SRE_HARDENING_V4_ENABLED`
- `AI_GOVERNANCE_V4_ENABLED`

Use `NEXT_PUBLIC_*` variants where UI needs direct flag visibility. Backend supports fallback to non-public env names.

## API Surface
### Governance
- `GET/PUT /api/org/settings`
- `GET/POST /api/org/workspaces`
- `GET/PUT /api/org/policies/access`
- `GET/PUT /api/org/policies/retention`

### Compliance / Security
- `GET /api/compliance/report`
- `POST /api/compliance/legal-hold`
- `POST /api/compliance/data-export/request`
- `POST /api/security/mfa/policy`
- `POST /api/security/session/policy`

### Integrations / Ops
- `GET/POST /api/integrations/connectors`
- `GET/PUT /api/integrations/connectors/:id`
- `GET /api/integrations/runs`
- `POST /api/integrations/runs/:id/replay`
- `POST /api/webhooks/rotate-secret`
- `GET /api/ops/health/slo`
- `GET /api/ops/queue/status`
- `POST /api/ops/rollback/simulate`
- `POST /api/ops/backup/verify`

### AI Governance
- `GET/PUT /api/ai-governance/policies`
- `GET /api/ai-governance/models`
- `POST /api/ai-governance/drift/recompute`
- `GET /api/ai-governance/audit`

## Recommended Rollout Waves
1. Enable `ORG_GOVERNANCE_V4_ENABLED` and validate org/workspace policy reads/writes.
2. Enable `COMPLIANCE_V4_ENABLED` and validate retention/legal-hold/data-export flows.
3. Enable `INTEGRATIONS_V4_ENABLED` and validate connector CRUD, run logs, replay behavior.
4. Enable `SRE_HARDENING_V4_ENABLED` and validate SLO/queue/backup/rollback endpoints.
5. Enable `AI_GOVERNANCE_V4_ENABLED` and validate policy/model/drift/audit endpoints.

## Verification Checklist
- Build passes: `npm run build`
- Flag-off regression: existing ATS modules behave unchanged.
- Admin-only protection is enforced for all Phase 4 APIs.
- Governance page loads and reflects flag states.
- Drift recompute and connector replay produce auditable records.

## Rollback Procedure
1. Set all Phase 4 flags to `false`.
2. Redeploy web service.
3. Verify `/dashboard`, `/pipeline`, `/jobs`, `/interviews`, `/attendance`.
4. If issue persists, rollback Railway deployment to previous stable release.

## Notes
- Phase 4 is additive and does not require destructive schema changes.
- Use migration `0070_phase4_enterprise_scale_trust.sql` before enabling flags in production.
