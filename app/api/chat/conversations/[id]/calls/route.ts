import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createChatCallRoom, endChatCallRoom } from "@/lib/chatCalls";

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

    const body = await request.json().catch(() => ({}));
    const mode = normalizeMode(body?.mode);
    const durationMinutesRaw = Number(body?.duration_minutes);
    const durationMinutes =
      Number.isFinite(durationMinutesRaw) && durationMinutesRaw >= 10 && durationMinutesRaw <= 180
        ? Math.trunc(durationMinutesRaw)
        : 30;
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
    const modeLabel = mode === "screenshare" ? "Screen Share" : "Call";
    const title = `${modeLabel} • ${conv.name || "Chat conversation"}`;

    const room = await createChatCallRoom({
      conversationId,
      createdByUserId: access.user_id,
      title,
      mode,
      startAt,
      endAt,
      activateNow: true,
    });

    const systemMessage =
      mode === "screenshare"
        ? `Screen share session started. Join: ${room.join_url}`
        : `Call started. Join: ${room.join_url}`;
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [conversationId, access.user_id, systemMessage],
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

    return NextResponse.json({
      operation_status: "success",
      user_message: `${modeLabel} created successfully.`,
      event: room,
      join_link: room.join_url || null,
      session_mode: mode,
      is_active: true,
      status_kind: mode === "screenshare" ? "presenting" : "in_call",
      status_priority: mode === "screenshare" ? 1 : 2,
      provider: "ats_native",
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        error: error instanceof Error ? error.message : "Failed to start call.",
      },
      { status: 400 },
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

    const ended = await endChatCallRoom(eventId, access.user_id);
    if (!ended) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "This call is already ended.",
          room_closed_reason: "ended",
        },
        { status: 409 },
      );
    }
    await query(
      `UPDATE chat_call_participants SET left_at = NOW() WHERE room_id = $1 AND left_at IS NULL`,
      [eventId],
    );
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [conversationId, access.user_id, `Call ended: ${event.title}`],
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

    return NextResponse.json({
      operation_status: "success",
      user_message: "Call ended successfully.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to end call." }, { status: 400 });
  }
}
