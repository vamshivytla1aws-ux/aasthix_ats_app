import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createChatCallRoom, listConversationCallRooms } from "@/lib/chatCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertConversationMember(conversationId: number, userId: number) {
  const memberCheck = await query(
    `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return memberCheck.rowCount > 0;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
    }
    if (!(await assertConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    }

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
    const rooms = await listConversationCallRooms(conversationId, limit);
    const roomIds = rooms.map((room) => Number(room.id)).filter((id) => Number.isFinite(id) && id > 0);
    const participantsByRoom = new Map<number, Array<{ user_id: number; full_name: string }>>();

    if (roomIds.length > 0) {
      const participantRes = await query(
        `
        SELECT
          p.room_id,
          p.user_id,
          COALESCE(u.full_name, 'Unknown user') AS full_name
        FROM chat_call_participants p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.room_id = ANY($1::bigint[])
          AND p.left_at IS NULL
        ORDER BY p.joined_at ASC
        `,
        [roomIds],
      );
      for (const row of participantRes.rows as Array<{ room_id: number; user_id: number; full_name: string }>) {
        const roomId = Number(row.room_id);
        const list = participantsByRoom.get(roomId) ?? [];
        list.push({ user_id: Number(row.user_id), full_name: String(row.full_name || "Unknown user") });
        participantsByRoom.set(roomId, list);
      }
    }

    const events = rooms.map((room) => {
      const start = new Date(room.start_at).getTime() - 5 * 60_000;
      const end = new Date(room.end_at).getTime();
      const activeByWindow = Date.now() >= start && Date.now() <= end;
      const isActive = room.status === "active" || (room.status === "scheduled" && activeByWindow);
      const joined = participantsByRoom.get(Number(room.id)) ?? [];
      return {
        id: room.id,
        title: room.title,
        start_at: room.start_at,
        end_at: room.end_at,
        meet_link: room.join_url,
        join_url: room.join_url,
        status: room.status,
        calendar_sync_status: room.provider,
        provider: room.provider,
        session_mode: room.mode,
        is_active: isActive,
        created_by_user_id: room.created_by_user_id ?? null,
        joined_count: joined.length,
        joined_user_ids: joined.map((p) => p.user_id),
        joined_participants: joined,
        status_kind: isActive ? (room.mode === "screenshare" ? "presenting" : "in_call") : "none",
        status_priority: isActive ? (room.mode === "screenshare" ? 1 : 2) : 999,
      };
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("chat/conversations/[id]/calendar GET", error);
    return NextResponse.json({ error: "Failed to load chat calendar events." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
    }
    if (!(await assertConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body?.title || "").trim() || "Scheduled chat call";
    const startAt = new Date(String(body?.start_at || ""));
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "start_at must be a valid datetime." }, { status: 400 });
    }
    const durationRaw = Number(body?.duration_minutes);
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw >= 10 && durationRaw <= 240 ? Math.trunc(durationRaw) : 30;
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    const room = await createChatCallRoom({
      conversationId,
      createdByUserId: access.user_id,
      title,
      mode: "call",
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      activateNow: false,
    });

    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [conversationId, access.user_id, `New scheduled call: ${title}. Join: ${room.join_url}`],
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

    return NextResponse.json({
      operation_status: "success",
      user_message: "Call scheduled from chat calendar.",
      event: room,
      provider: "ats_native",
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        error: error instanceof Error ? error.message : "Failed to create chat calendar event.",
      },
      { status: 400 },
    );
  }
}
