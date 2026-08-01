# AI Interviews

AI Interviews is an additive ATS module. Human-led Google Meet scheduling remains unchanged.

## Architecture

- Recruiter pages live under `/ai-interviews` and use the existing JWT/RBAC system.
- Candidate links use `/ai-interview/{secureToken}`. The raw token is exchanged for an HttpOnly, interview-scoped session; PostgreSQL stores only its SHA-256 hash.
- PostgreSQL migrations `0092_ai_interviews.sql`, `0094_ai_model_routing_and_answer_audio.sql`, and `0095_adaptive_ai_interviews.sql` store interview metadata, adaptive state/provenance, questions, answers, consent, integrity events, evaluations, recording metadata, and audit events.
- OpenAI calls use the existing server-side API key and configurable AI Interview models. Model responses are JSON validated by Zod; rule-based fallbacks remain available.
- Cost-controlled defaults use `gpt-5.6-luna` with reasoning disabled. `gpt-5.6-terra` is limited to one final fallback review when the Luna result is invalid or materially conflicts with explicit resume evidence.
- Per-question audio uses `gpt-4o-mini-transcribe` only when the browser/typed transcript is missing or shorter than `INTERVIEW_TRANSCRIPTION_MIN_CHARS`. Set `INTERVIEW_TRANSCRIPTION_MODE=off` for zero transcription API spend or `always` for maximum transcription coverage.
- Browser MediaRecorder chunks are written to the private Railway volume and never under `public/`.
- One consented JPEG camera snapshot is captured after the interview starts and stored privately beside recordings. Authorized reviewers can view or download it from the completed report.
- The Railway web service starts answer evaluation immediately after submission. BullMQ/Redis provides an optional durability worker; atomic database claiming prevents duplicate evaluation.

## Railway deployment

1. Mount a persistent volume at `/data/ai-interviews` on the web service.
2. Add the AI Interview variables from `.env.railway.example`.
3. Keep `APP_PUBLIC_URL=https://app.aasthix.com`, `JWT_SECRET`, `DATABASE_URL`, `OPENAI_API_KEY`, email configuration, and `REDIS_URL` configured.
4. Deploy the web service; startup migrations create the new tables.
5. Recommended: add a worker service from the same repository. Set `APP_RUNTIME=ai-interview-worker` and use the normal start command so `railwayStart.mjs` launches `worker:ai-interview`. The web service can process interviews without it, but the worker recovers queued jobs after web restarts.
6. Grant the new permissions in Admin > Access control as needed.

The worker evaluates stored question transcripts and does not need direct volume access. Private recording playback is streamed by the authenticated web service.

## Adaptive interviews

New interviews default to adaptive mode; historical records remain fixed. Adaptive interviews generate only an opening question before activation, then use one structured Luna request per completed answer to evaluate evidence and prepare exactly one next question. The server controls duration, maximum questions, skill/project/scenario coverage, follow-up limits, and difficulty. A failed realtime request is retried once and then uses a current-skill rule-based fallback rather than Terra.

Recruiters can configure mandatory skills, maximum questions, project coverage, follow-up limits, scenario coverage, experience override, and coding/behavioural options during creation. Reports retain question source, reason, expected signals, answer evidence, missing points, skill coverage, projects discussed, and neutral claims requiring human review.

## Recording and retention

Recordings are assembled under `AI_INTERVIEW_RECORDING_ROOT/recordings`, and candidate snapshots are stored under `AI_INTERVIEW_RECORDING_ROOT/snapshots`. The newest `AI_INTERVIEW_VIDEO_RETENTION_COUNT` completed recordings are retained globally for this single-tenant deployment. Older physical recordings are deleted while questions, answers, transcripts, evaluations, snapshots, and integrity events remain.

Recording download is available through the authorized recording endpoint with `?download=1`. Recording-only deletion requires `ai_interviews.delete_recording`; it removes the physical video and clears video metadata while preserving the transcript, answers, evaluation, snapshot, and report. It is safe to retry if the file is already missing.

Permanent AI Interview deletion requires `ai_interviews.delete` and remains unchanged: it removes the interview, its cascaded report data, recording, snapshot, and unfinished staging files.

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
