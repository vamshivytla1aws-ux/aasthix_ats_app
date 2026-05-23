# Chat Calls No-Cost LiveKit Recovery (Railway)

This runbook is the strict checklist to stabilize chat-call voice without changing provider.

## 1) Prerequisites (must pass)

Set these Railway variables on the web service:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `NEXT_PUBLIC_CHAT_ICE_SERVERS` (must include at least one `turn:` or `turns:` entry)
- `APP_PUBLIC_URL` (valid HTTPS domain)

## 2) Readiness gate command

Before any call testing, verify health:

- `GET /api/chat/calls/health`

Expected:

- `operation_status: "success"`
- `ready: true`
- `checks.livekit.configured: true`
- `checks.turn.configured: true`
- `checks.schema.schema_ready: true`

If blocked, fix the reported `issues` and retry.

## 3) TURN hardening requirements

- Include both UDP/TLS and TCP/TLS TURN candidates when possible.
- Ensure TURN credentials are current (not rotated/expired).
- Re-verify `/api/chat/calls/health` after TURN changes.

## 4) Schema readiness requirements

`chat_call_signals_type_chk` must include all:

- `offer`
- `answer`
- `ice`
- `leave`
- `presenting`
- `media_repair`
- `moderation_mute`
- `moderation_unmute`
- `moderation_remove`
- `moderation_end`

Call state should report:

- `signal_schema_ready: true`

When false, advanced controls remain safely gated.

## 5) Two-user strict smoke (Windows desktop + Android)

1. User A (Windows) starts call.
2. User B (Android) accepts within 10 seconds.
3. Verify:
   - participant count = 2
   - two-way audio for 30 seconds
   - no persistent reconnecting banner
4. Trigger `Repair voice` once.
5. Wait 8–10 seconds and verify:
   - no signal constraint error
   - audio remains two-way
6. End-for-all from host:
   - both sides tear down quickly
   - no stale `In call` badge or active pill

## 6) Diagnostics capture and pass/fail gates

Capture diagnostics JSON:

- once right after repair
- once after end-for-all

Use:

- `GET /api/chat/calls/[roomId]/diagnostics`

Pass conditions:

- `media_health` is not persistently `reconnect_loop`
- `latest_telemetry_by_user` contains fresh rows for both participants
- `remote_audio_tracks_count > 0` during active two-user call
- ended room does not linger in active/reconnecting verdict

Fail conditions:

- both users remain `remote_audio_tracks_count = 0` while joined
- `connection_state = reconnecting` persists > 20s
- `signal_schema_ready = false` in active environment
- stale active-call UI after terminal state

