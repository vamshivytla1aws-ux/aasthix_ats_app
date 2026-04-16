# Railway Deployment Guide

This repo deploys best as multiple Railway services inside one project:

1. `web` for the Next.js app
2. `postgres` for the database
3. `redis` for BullMQ
4. `python-matcher` for `matcher-service/`
5. `ai-worker` for queued AI matching

## 1. Create the Railway project

1. Push this repo to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Add `PostgreSQL`.
4. Add `Redis`.

## 2. Create the web service

Create a service from the repo root:

- Root directory: `/`
- Build command: auto-detected by Nixpacks or `npm run build`
- Start command: auto from `railway.json` or `npm start`

Add these variables to the web service:

- `DATABASE_URL`
- `DB_SSL=true`
- `REDIS_URL`
- `JWT_SECRET`
- `APP_PUBLIC_URL`
- `CRON_SECRET`
- `MATCHER_PYTHON_URL`
- `CAREERS_PUBLISHER_USER_ID` if you want `/careers` and the jobs preview portal to publish jobs
- `OPENAI_API_KEY` if AI features should work (matching, embeddings, drafts, etc.)
- `OPEN_ADMIN_AI_KEY` (optional) org **Admin** API key used **only** by the Usage dashboard OpenAI tab. Set it **in addition to** `OPENAI_API_KEY`. If you replace or remove `OPENAI_API_KEY`, features like 1:1 match will stop working. The app also checks `OPENAI_ADMIN_API_KEY`, `Open_admin_AI_Key`, and `OPEN_AI_ADMIN_KEY` if the primary name is missing (Railway names are case-sensitive). Do not paste a leading `Bearer ` in the value. For multi-org accounts, add `OPEN_ADMIN_USAGE_ORG` or `OPENAI_ORGANIZATION_ID` with your `org-…` id if usage calls fail or return the wrong org.
- SMTP vars if email features should work

Use `.env.railway.example` as the template.

Recommended domain setup for Aasthix:

- keep the marketing site on `https://www.aasthix.com`
- add a Railway custom domain: `app.aasthix.com`
- add a Hostinger DNS record: `CNAME app -> web-production-51c20.up.railway.app`
- set `APP_PUBLIC_URL=https://app.aasthix.com`

Deployment note:

- if Railway appears stuck on an older successful GitHub deploy, push a fresh commit to `initial-upload` to force the web service to rebuild from the latest branch head

This keeps:

- public careers pages on `https://app.aasthix.com/careers`
- single-job public links on `https://app.aasthix.com/careers/job/<id>`
- authenticated ATS pages on `https://app.aasthix.com/dashboard`

The ATS middleware already keeps `/careers` public while redirecting private app routes to `/login` when no auth cookie is present.

Important:

- do not put `OPENAI_API_KEY` or any other secrets in Git
- keep secrets in Railway Variables only
- remove `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and `SEED_ADMIN_NAME` if they were used during first-time setup, because startup admin seeding is not part of normal access control

## 3. Create the Python matcher service

Create another service from the `matcher-service/` directory:

- Root directory: `/matcher-service`
- Start command: auto from `matcher-service/railway.json`

The stdlib matcher now binds to Railway's `PORT` and `0.0.0.0`, so it can run without extra packages.

After deploy, copy its public URL into the web service:

- `MATCHER_PYTHON_URL=https://<python-matcher-domain>/match`

Optional health check:

- `https://<python-matcher-domain>/health`

## 4. Create the AI worker service

Create a third code service from the repo root:

- Root directory: `/`
- Start command: `npm run worker:ai-match`

Add at least:

- `DATABASE_URL`
- `DB_SSL=true`
- `REDIS_URL`
- `OPENAI_API_KEY` when AI matching is enabled

Keep the worker env aligned with the web app for any `AI_*` or `MATCH_*` tuning vars.

## 5. Run database migrations

This repo uses ordered SQL files in `migrations/`, not Prisma runtime migrations.

Run these files against the Railway Postgres database in ascending order:

- `0001_init_ats.sql`
- `0002_candidates_extra_fields.sql`
- `0003_drop_candidate_extra_fields.sql`
- `0004_applications_stage.sql`
- `0005_users_auth.sql`
- `0006_candidates_resume_url.sql`
- `0007_candidates_skillset.sql`
- `0008_candidates_skills.sql`
- `0009_vendors_and_job_vendor_id.sql`
- `0010_candidates_salary_fields.sql`
- `0011_vendors_client_fields.sql`
- `0012_vendors_invoice_days.sql`
- `0013_applications_interview_schedule.sql`
- `0014_applications_interview_reminders.sql`
- `0015_alerts_table.sql`
- `0016_candidate_profile_tables.sql`
- `0017_alerts_status_expiry.sql`
- `0018_rbac_user_permissions.sql`
- `0026_interview_outcome_tracking.sql`
- `0027_clients_spoc_and_renewals.sql`
- `0028_client_agreement_enabled.sql`
- `0029_jobs_openings_employment_type.sql`
- `0030_candidates_notice_period.sql`
- `0031_job_interview_questions.sql`
- `0032_job_skill_matching.sql`
- `0033_candidates_user_email_unique.sql`
- `0034_applications_interview_ops.sql`
- `0035_screening_workflow.sql`
- `0036_screening_hardening.sql`
- `0037_careers_portal.sql`
- `0038_disposition_audit.sql`
- `0039_approval_requests.sql`
- `0040_job_team.sql`
- `0041_chat.sql`
- `0042_chat_attachments.sql`
- `0044_hr_assistant_chat.sql`
- `0045_candidates_resume_text.sql`
- `0046_ai_match_job_runs.sql`
- `0047_match_pgvector_embeddings.sql`
- `0049_invites_audit_stricter_rbac.sql`
- `0050_applications_assigned_recruiter.sql`
- `0051_client_renewal_email_sent.sql`
- `0052_no_ai_match_prefilter.sql`
- `0053_hybrid_top10_ai_rerank.sql`
- `0054_single_candidate_match_checks.sql`
- `0055_pipeline_sticky_notes.sql`
- `0056_pipeline_board_sticky_notes.sql`
- `0057_team_notes_board_column.sql`
- `0058_recruiter_saved_views_scorecards_gdpr.sql`
- `0059_pipeline_interview_enhancements.sql`

Important:

- `0047_match_pgvector_embeddings.sql` means your Postgres must support `pgvector`
- check missing migration numbers before production if they existed in a different branch or private history

## 6. Set up the cron endpoint

This repo already includes a renewal email cron route:

- `app/api/cron/client-renewal-emails/route.ts`

Schedule a `POST` request to:

- `https://<web-domain>/api/cron/client-renewal-emails`

Header:

- `Authorization: Bearer <CRON_SECRET>`

Only configure this after SMTP vars are set if you expect email delivery.

## 7. Smoke test after deploy

1. Open `/login`
2. Log in
3. Verify dashboard pages load
4. Create or edit a record backed by Postgres
5. Hit the matcher `/health` endpoint
6. Trigger one queue-backed AI match flow
7. Trigger the cron route manually with the bearer token
