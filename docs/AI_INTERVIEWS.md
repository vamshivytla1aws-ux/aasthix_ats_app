# AI Interviews

AI Interviews is an additive ATS module. Human-led Google Meet scheduling remains unchanged.

## Architecture

- Recruiter pages live under `/ai-interviews` and use the existing JWT/RBAC system.
- Candidate links use `/ai-interview/{secureToken}`. The raw token is exchanged for an HttpOnly, interview-scoped session; PostgreSQL stores only its SHA-256 hash.
- PostgreSQL migration `0092_ai_interviews.sql` stores interview metadata, questions, answers, consent, integrity events, evaluations, recording metadata, and audit events.
- OpenAI calls use the existing server-side API key and configurable AI Interview models. Model responses are JSON validated by Zod; rule-based fallbacks remain available.
- Browser MediaRecorder chunks are written to the private Railway volume and never under `public/`.
- BullMQ/Redis processes answer evaluation and the final report asynchronously.

## Railway deployment

1. Mount a persistent volume at `/data/ai-interviews` on the web service.
2. Add the AI Interview variables from `.env.railway.example`.
3. Keep `APP_PUBLIC_URL=https://app.aasthix.com`, `JWT_SECRET`, `DATABASE_URL`, `OPENAI_API_KEY`, email configuration, and `REDIS_URL` configured.
4. Deploy the web service; startup migrations create the new tables.
5. Add a worker service from the same repository. Set `APP_RUNTIME=ai-interview-worker` and use the normal start command so `railwayStart.mjs` launches `worker:ai-interview`.
6. Grant the new permissions in Admin > Access control as needed.

The worker evaluates stored question transcripts and does not need direct volume access. Private recording playback is streamed by the authenticated web service.

## Recording and retention

Recordings are assembled under `AI_INTERVIEW_RECORDING_ROOT/recordings`. The newest `AI_INTERVIEW_VIDEO_RETENTION_COUNT` completed recordings are retained globally for this single-tenant deployment. Older physical files are deleted while questions, answers, transcripts, evaluations, and integrity events remain.

Never mount the recording directory inside `public/`. If a volume is missing or read-only, answer submission still completes but recording finalization is marked for recruiter review.

## Browser and privacy behavior

The first release supports current Chrome and Edge on laptop/desktop. Candidates explicitly consent before media access. Browser monitoring covers tab visibility, focus, fullscreen, media interruption, network state, copy/paste attempts inside the interview page, local face presence, multiple faces, and approximate prolonged head direction.

Face landmarks run locally through MediaPipe. Continuous landmark data is not uploaded. The system performs no emotion, honesty, identity, demographic, operating-system process, or background-application detection. Integrity events never automatically reduce answer scores or reject a candidate.

## Troubleshooting

- Camera/microphone denied: enable site permissions, close other apps using the device, and rerun system checks.
- Recording upload fails: verify the Railway volume mount and `AI_INTERVIEW_RECORDING_ROOT` permissions.
- Report remains processing: verify Redis and the `ai-interview-worker` service, then use the retry endpoint/action for failed processing.
- Public link redirects to login: confirm middleware contains the `/ai-interview` public prefix and redeploy.
- OpenAI unavailable: question generation falls back to deterministic questions; reports show recruiter-review guidance.

## Rollback

Disable `AI_INTERVIEW_ENABLED=false` first. This hides navigation and blocks module APIs without affecting existing interviews. Roll back application code before removing tables. Preserve/export interview reports and recording files before any manual schema removal; migrations are intentionally additive and do not alter Google Meet scheduling columns.

## Optional native secure-agent phase

A later Windows agent may provide explicitly consented kiosk controls and device-level enforcement. It must remain a separate optional phase, use signed binaries, document exactly what is monitored, and never be represented as capability of the browser MVP.
