import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logCallEvent } from "@/lib/chatCallGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toFiniteNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Invalid room id." },
        { status: 400 },
      );
    }

    const roomRes = await query(
      `SELECT id, conversation_id, status FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [roomId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number; status: string } | undefined;
    if (!room) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Call room not found." },
        { status: 404 },
      );
    }

    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [room.conversation_id, access.user_id],
    );
    if (!memberRes.rowCount) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Not a member of this conversation." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "sample").trim().slice(0, 40) || "sample";
    const metadata = {
      reason,
      call_state: String(body?.call_state || "unknown"),
      connection_state: String(body?.connection_state || "unknown"),
      media_state: String(body?.media_state || "unknown"),
      publish_state: String(body?.publish_state || "unknown"),
      subscribe_state: String(body?.subscribe_state || "unknown"),
      local_audio_track_present: Boolean(body?.local_audio_track_present),
      remote_audio_tracks_count: toFiniteNumber(body?.remote_audio_tracks_count, 0),
      audio_level: Math.max(0, Math.min(1, toFiniteNumber(body?.audio_level, 0))),
      mic_enabled: Boolean(body?.mic_enabled),
      camera_enabled: Boolean(body?.camera_enabled),
      autoplay_blocked: Boolean(body?.autoplay_blocked),
      device_state: String(body?.device_state || "unknown"),
      permission_state: String(body?.permission_state || "unknown"),
      media_error: String(body?.media_error || "").slice(0, 240),
      user_agent: String(request.headers.get("user-agent") || "").slice(0, 240),
      client_ts: String(body?.client_ts || new Date().toISOString()),
      joined_count_hint: toFiniteNumber(body?.joined_count_hint, 0),
    };

    await logCallEvent({
      roomId,
      conversationId: room.conversation_id,
      userId: access.user_id,
      eventType: "media_telemetry",
      metadata,
      eventKey: `media_telemetry:${roomId}:${access.user_id}:${Date.now()}`,
    });

    return NextResponse.json({
      operation_status: "success",
      user_message: "Telemetry captured.",
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to capture telemetry." },
      { status: 500 },
    );
  }
}

