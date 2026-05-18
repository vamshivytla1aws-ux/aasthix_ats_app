## ATS App (Next.js + Tailwind + PostgreSQL)

This is a minimal full-stack Applicant Tracking System scaffold built with:

- **Next.js (App Router)**
- **Tailwind CSS**
- **PostgreSQL** using **node-postgres (`pg`)**

### Structure

- `app/` - App Router pages and API routes
  - `app/page.tsx` - main dashboard
  - `app/api/jobs/route.ts` - backend routes for jobs
- `components/` - shared UI components (e.g. `JobList`)
- `lib/db.js` - node-postgres connection pool using `DATABASE_URL`
- `api/` - placeholder for additional backend utilities or services

### Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
DB_SSL=false
```

### Getting Started

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

# aasthix_ats_app

## Railway Deployment

Railway-ready config files have been added for:

- the main Next.js web app: `railway.json`

Deployment guide:

- `docs/railway-deploy.md`

Environment variable template:

- `.env.railway.example`

Notes:

- keep secrets such as `OPENAI_API_KEY` in Railway Variables, not in Git
- the public careers portal needs `CAREERS_PUBLISHER_USER_ID` set on the server to show jobs in `/careers`
- recommended public ATS domain: `https://app.aasthix.com`
- keep the marketing site on `https://www.aasthix.com` and point `app.aasthix.com` to Railway with a `CNAME`

## ATS Desktop App (Windows EXE)

The ATS can be packaged as a Windows desktop app (Electron shell that loads cloud ATS URL).

Required environment variables for desktop runtime:

- `ATS_DESKTOP_TARGET_URL` (example: `https://app.aasthix.com`)
- `ATS_DESKTOP_CHANNEL` (`stable` or `beta`)
- `ATS_DESKTOP_ENTRY_PATH` (default: `/chat-app` for pure chat desktop mode)

Build and run:

```bash
npm run desktop:dev
npm run desktop:build:win
```

Output installer:

- `dist/ATS-Setup-x.y.z.exe`

Optional helper scripts:

- `scripts/install-ats-desktop.bat`
- `scripts/uninstall-ats-desktop.bat`

Desktop health check endpoint used by the shell fallback:

- `GET /api/desktop/health`

## Google Meet Interview Scheduling

Interview scheduling now supports a shared-company Google Calendar connection that creates real Google Meet links from the ATS.

Required server-side variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APP_PUBLIC_URL`

Optional:

- `GOOGLE_CALENDAR_ID` (defaults to `primary`)
- `CALENDAR_TOKEN_SECRET` (recommended dedicated secret for stored OAuth tokens)

How it works:

- an admin connects the shared Google account from `Settings -> Calendar & Meet`
- the ATS stores Google OAuth tokens server-side only
- scheduling or rescheduling an interview creates or updates the Google Calendar event
- candidate and internal panel attendees receive the Google invite
- if Google is not connected, ATS scheduling still works and the UI shows `Google not connected`

Known limitations:

- the migration for calendar fields must be applied on Railway Postgres before live scheduling can store Meet metadata
- the OAuth callback URL must match `APP_PUBLIC_URL/api/settings/calendar/google/callback`
- Google API quota / permission issues are surfaced in the UI as calendar sync errors instead of silently pretending the Meet invite succeeded

## AI Usage Dashboard

The header `More` menu includes an `AI Usage` entry for admins. It opens a quick summary panel and a full usage dashboard at `/usage`.

Required server-side variables:

- `OPENAI_API_KEY`
- `OPENAI_MONTHLY_BUDGET`
- `OPENAI_MONTHLY_TOKEN_LIMIT` (optional)
- `RAILWAY_API_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_SERVICE_ID` (optional)
- `RAILWAY_ENVIRONMENT_ID` (optional)
- `RAILWAY_PLAN_NAME` (optional manual label)
- `RAILWAY_USAGE_LIMIT` (optional manual quota / budget cap)

Direct from provider:

- OpenAI organization usage buckets
- OpenAI organization costs when the configured key has admin access
- Railway GraphQL project / service usage, metrics, and available estimated usage fields

Calculated estimate:

- OpenAI per-model row cost allocation when only daily total cost is returned
- OpenAI cost estimates when the provider does not return direct cost data for the selected range
- Railway projected usage for the billing cycle when only current usage is available
- Railway billing period dates when provider billing-cycle fields are unavailable

Configured manually:

- `OPENAI_MONTHLY_BUDGET`
- `OPENAI_MONTHLY_TOKEN_LIMIT`
- `RAILWAY_PLAN_NAME`
- `RAILWAY_USAGE_LIMIT`

Known limitations:

- OpenAI usage / costs endpoints may require organization-level admin access on the configured key. When that access is missing, the UI shows `Unavailable from provider`.
- Railway plan and quota details are not always returned directly by the provider. Those values can be supplied with `RAILWAY_PLAN_NAME` and `RAILWAY_USAGE_LIMIT`.
- Some Railway usage metrics are returned as raw infrastructure measurements rather than invoice-ready dollar totals, so derived values are labeled `Calculated estimate`.

## Phase 2 Redesign Flags and Personalization

Phase 2 deep redesign is controlled by runtime flags for safe release and instant rollback.

Required (set in Railway Variables):

- `NEXT_PUBLIC_IA_V2_ENABLED`
- `NEXT_PUBLIC_DASHBOARD_V2_ENABLED`
- `NEXT_PUBLIC_PERSONALIZATION_V2_ENABLED`

Workspace personalization APIs:

- `GET/PUT /api/workspace/preferences`
- `GET/PUT /api/workspace/layout`
- `GET /api/workspace/defaults`

Migration required:

- `0068_workspace_personalization.sql`

Rollback guide:

- `docs/phase2-rollout-runbook.md`

## Phase 3 Intelligence / Automation / Forecasting

Phase 3 is additive and controlled by flags:

- `NEXT_PUBLIC_INTELLIGENCE_V3_ENABLED`
- `NEXT_PUBLIC_AUTOMATION_V3_ENABLED`
- `NEXT_PUBLIC_FORECAST_V3_ENABLED`
- `NEXT_PUBLIC_CALIBRATION_V3_ENABLED`

New APIs:

- `/api/intelligence/*`
- `/api/automation/*`
- `/api/forecast/*`
- `/api/interviews/scorecard-template`
- `/api/interviews/scorecard`

Migration required:

- `0069_phase3_intelligence_automation_forecast.sql`

Governance surface:

- `/governance` (dashboard module)

## Phase 4 Enterprise Scale + Trust Layer

Phase 4 rollout flags:

- `NEXT_PUBLIC_ORG_GOVERNANCE_V4_ENABLED`
- `NEXT_PUBLIC_COMPLIANCE_V4_ENABLED`
- `NEXT_PUBLIC_INTEGRATIONS_V4_ENABLED`
- `NEXT_PUBLIC_SRE_HARDENING_V4_ENABLED`
- `NEXT_PUBLIC_AI_GOVERNANCE_V4_ENABLED`

Phase 4 APIs:

- `/api/org/*`
- `/api/compliance/*`
- `/api/security/*`
- `/api/integrations/*`
- `/api/webhooks/rotate-secret`
- `/api/ops/*`
- `/api/ai-governance/*`

Migration:

- `0070_phase4_enterprise_scale_trust.sql`
