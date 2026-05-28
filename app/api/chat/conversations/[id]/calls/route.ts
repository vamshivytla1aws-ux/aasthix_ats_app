import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { closeChatCallRoomTransactional, createChatCallRoom, getChatCallSignalSchemaHealth } from "@/lib/chatCalls";
import { canStartCallByPolicy, getChatCallPolicy, logCallEvent } from "@/lib/chatCallGovernance";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CallMode = "call" | "screenshare";

function normalizeMode(value: unknown): CallMode {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "screenshare" ? "screenshare" : "call";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });

    const memberCheck = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, access.user_id],
    );
    if (!memberCheck.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });

    const convRes = await query(`SELECT id, name FROM conversations WHERE id = $1 LIMIT 1`, [conversationId]);
    const conv = convRes.rows[0] as { id: number; name: string | null } | undefined;
    if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const policy = await getChatCallPolicy();
    if (!canStartCallByPolicy(access, policy)) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "Call start is restricted by policy.",
          hint: "Ask admin to update chat call policy.",
        },
        { status: 403 },
      );
    }
    const schemaHealth = await getChatCallSignalSchemaHealth();
    if (!schemaHealth.schema_ready) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "Chat call schema is not ready on this deployment.",
          hint: `Run latest migrations. Missing: ${schemaHealth.missing_types.join(", ")}`,
          schema_ready: false,
          missing_types: schemaHealth.missing_types,
        },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestKey = request.headers.get("x-idempotency-key")?.trim() || "";
    const correlationId = resolveCallCorrelationId({
      correlationHeader: request.headers.get("x-call-correlation-id"),
      idempotencyHeader: requestKey,
    });
    const mode = normalizeMode(body?.mode);
    const durationMinutesRaw = Number(body?.duration_minutes);
    const durationMinutes =
      Number.isFinite(durationMinutesRaw) && durationMinutesRaw >= 10 && durationMinutesRaw <= 180
        ? Math.trunc(durationMinutesRaw)
        : 30;
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
    const modeLabel = mode === "screenshare" ? "Screen Share" : "Call";
    const title = `${modeLabel} - ${conv.name || "Chat conversation"}`;

    const existingRooms = await query(
      `
      SELECT r.id, r.conversation_id, r.title, r.mode, r.status, r.start_at, r.end_at, r.join_url, r.provider, r.created_by_user_id, r.created_at, r.ended_at,
             COALESCE(active_sessions.count, 0)::int AS active_session_count
      FROM chat_call_rooms r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count
        FROM chat_call_participants p
        WHERE p.room_id = r.id
          AND p.left_at IS NULL
      ) active_sessions ON TRUE
      WHERE r.conversation_id = $1
        AND r.status IN ('active','scheduled')
      ORDER BY r.id DESC
      LIMIT 5
      `,
      [conversationId],
    );
    for (const existing of existingRooms.rows as Array<any>) {
      const roomAgeMs = Math.max(0, Date.now() - new Date(existing.start_at).getTime());
      if (Number(existing.active_session_count || 0) > 0 || roomAgeMs < 30_000) {
        return NextResponse.json({
          operation_status: "success",
          user_message: "Existing call is active.",
          room: existing,
          room_state: existing,
          join_link: existing.join_url || null,
          session_mode: existing.mode,
          is_active: true,
          status_kind: existing.mode === "screenshare" ? "presenting" : "in_call",
          status_priority: existing.mode === "screenshare" ? 1 : 2,
          provider: "ats_native",
          schema_ready: true,
          correlation_id: correlationId,
          event_accepted: false,
          idempotent_replay: true,
        });
      }
      await closeChatCallRoomTransactional({
        roomId: Number(existing.id),
        conversationId,
        endedByUserId: null,
        reason: "timeout",
        systemMessage: "Call ended due to no active sessions.",
        messageSenderId: null,
        eventUserId: null,
        eventKey: `auto_close_empty:${existing.id}`,
        correlationId,
      });
    }

    const room = await createChatCallRoom({
      conversationId,
      createdByUserId: access.user_id,
      title,
      mode,
      startAt,
      endAt,
      activateNow: true,
    });

    const systemMessage = mode === "screenshare" ? "Screen share started." : "Call started.";
    const eventAccepted = await logCallEvent({
      roomId: Number(room.id),
      conversationId,
      userId: access.user_id,
      eventType: "call_start",
      eventKey: requestKey || `call_start:${room.id}:${access.user_id}`,
      metadata: { session_mode: mode },
      correlationId,
    });
    if (eventAccepted) {
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
        [conversationId, access.user_id, systemMessage],
      );
    }
    try {
      await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    } catch (error) {
      console.warn("[chat-calls] failed to touch conversation timestamp", error);
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: `${modeLabel} created successfully.`,
      room,
      room_state: room,
      join_link: room.join_url || null,
      session_mode: mode,
      is_active: true,
      status_kind: mode === "screenshare" ? "presenting" : "in_call",
      status_priority: mode === "screenshare" ? 1 : 2,
      provider: "ats_native",
      schema_ready: true,
      correlation_id: correlationId,
      event_accepted: eventAccepted,
      idempotent_replay: !eventAccepted,
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("[chat-call] calls_start_route_error", { request_id: requestId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: "Unable to start call.",
        error: error instanceof Error ? error.message : "Failed to start call.",
        request_id: requestId,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });

    const memberCheck = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, access.user_id],
    );
    if (!memberCheck.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });

    const url = new URL(request.url);
    const requestKey = request.headers.get("x-idempotency-key")?.trim() || "";
    const correlationId = resolveCallCorrelationId({
      correlationHeader: request.headers.get("x-call-correlation-id"),
      idempotencyHeader: requestKey,
    });
    const eventId = Number(url.searchParams.get("event_id"));
    if (!Number.isFinite(eventId)) return NextResponse.json({ error: "event_id is required." }, { status: 400 });

    const eventRes = await query(
      `SELECT id, title, conversation_id, provider FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [eventId],
    );
    const event = eventRes.rows[0] as { id: number; title: string; conversation_id: number; provider: string } | undefined;
    if (!event) return NextResponse.json({ error: "Call room not found." }, { status: 404 });
    if (event.provider !== "ats_native") {
      return NextResponse.json({ error: "This endpoint can end native chat calls only." }, { status: 400 });
    }
    if (Number(event.conversation_id) !== conversationId) {
      return NextResponse.json({ error: "Call room does not belong to this conversation." }, { status: 403 });
    }

    const closed = await closeChatCallRoomTransactional({
      roomId: Number(event.id),
      conversationId,
      endedByUserId: access.user_id,
      reason: "ended",
      systemMessage: "Call ended.",
      messageSenderId: access.user_id,
      eventUserId: access.user_id,
      eventKey: requestKey || `call_end:${event.id}:${access.user_id}`,
      correlationId,
    });
    if (!closed.closed) {
      return NextResponse.json({
        operation_status: "success",
        user_message: "Call already ended.",
        room_closed_reason: "ended",
        room_status: "ended",
        terminal_confirmed: true,
        correlation_id: correlationId,
        idempotent_replay: true,
      });
    }
    try {
      await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    } catch (error) {
      console.warn("[chat-calls] failed to touch conversation timestamp on call end", error);
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: "Call ended successfully.",
      room_closed_reason: "ended",
      room_status: "ended",
      terminal_confirmed: true,
      correlation_id: correlationId,
      event_accepted: closed.event_accepted,
      idempotent_replay: !closed.event_accepted,
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("[chat-call] calls_end_route_error", { request_id: requestId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: "Unable to end call.",
        error: error instanceof Error ? error.message : "Failed to end call.",
        request_id: requestId,
      },
      { status: 500 },
    );
  }
}
