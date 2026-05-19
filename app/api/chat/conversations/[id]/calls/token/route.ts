import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  buildLiveKitRoomName,
  createLiveKitToken,
  isLiveKitConfigured,
  liveKitUrl,
} from "@/lib/livekit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!isLiveKitConfigured()) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "LiveKit is not configured.",
          hint: "Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.",
        },
        { status: 503 },
      );
    }
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
    }
    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [conversationId, access.user_id],
    );
    if (!memberRes.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    const iceConfigRaw = String(process.env.NEXT_PUBLIC_CHAT_ICE_SERVERS || "");
    const turnConfigured = /turns?:/i.test(iceConfigRaw);
    if (!turnConfigured) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "TURN server is not configured for enterprise calling.",
          hint: "Set NEXT_PUBLIC_CHAT_ICE_SERVERS with at least one TURN/TURNS entry.",
          media_state: "failed",
        },
        { status: 503 },
      );
    }

    const roomRes = await query(
      `SELECT id, conversation_id FROM chat_call_rooms WHERE conversation_id = $1 AND status IN ('active','scheduled') ORDER BY id DESC LIMIT 1`,
      [conversationId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number } | undefined;
    if (!room) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "No active or scheduled call found." },
        { status: 409 },
      );
    }
    const userRes = await query(`SELECT full_name FROM users WHERE id = $1 LIMIT 1`, [access.user_id]);
    const fullName = String((userRes.rows[0] as { full_name?: string } | undefined)?.full_name || `User ${access.user_id}`);
    const roomName = buildLiveKitRoomName(conversationId, Number(room.id));
    const token = await createLiveKitToken({
      identity: `user-${access.user_id}`,
      name: fullName,
      roomName,
    });
    return NextResponse.json({
      operation_status: "success",
      room_id: Number(room.id),
      room_name: roomName,
      livekit_url: liveKitUrl(),
      token,
      media_state: "ready",
      turn_ready: true,
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to issue call token." },
      { status: 500 },
    );
  }
}
