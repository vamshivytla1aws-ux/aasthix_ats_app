import { query } from "@/lib/db";
import { buildPublicUrl } from "@/lib/publicUrl";

export type ChatCallMode = "call" | "screenshare";
export type ChatCallStatus = "scheduled" | "active" | "ended" | "cancelled";

export type ChatCallRoom = {
  id: number;
  conversation_id: number;
  title: string;
  mode: ChatCallMode;
  status: ChatCallStatus;
  start_at: string;
  end_at: string;
  join_url: string | null;
  provider: "ats_native";
  created_by_user_id: number | null;
  created_at: string;
  ended_at: string | null;
};

function modeFromTitle(title: string, fallback: ChatCallMode) {
  const t = String(title || "").toLowerCase();
  if (t.includes("screen share")) return "screenshare";
  return fallback;
}

export function buildChatCallJoinUrl(conversationId: number, roomId: number) {
  return buildPublicUrl(`/chat-app?conversation=${conversationId}&room=${roomId}`);
}

export async function createChatCallRoom(input: {
  conversationId: number;
  createdByUserId: number;
  title: string;
  mode: ChatCallMode;
  startAt: string;
  endAt: string;
  activateNow?: boolean;
}) {
  const status: ChatCallStatus = input.activateNow ? "active" : "scheduled";
  const ins = await query(
    `
    INSERT INTO chat_call_rooms (
      conversation_id, title, mode, status, start_at, end_at, provider, created_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, 'ats_native', $7)
    RETURNING id
    `,
    [
      input.conversationId,
      input.title.trim(),
      input.mode,
      status,
      input.startAt,
      input.endAt,
      input.createdByUserId,
    ],
  );
  const roomId = Number(ins.rows[0]?.id || 0);
  const joinUrl = buildChatCallJoinUrl(input.conversationId, roomId);
  await query(`UPDATE chat_call_rooms SET join_url = $2, updated_at = NOW() WHERE id = $1`, [roomId, joinUrl]);
  const row = await query(`SELECT * FROM chat_call_rooms WHERE id = $1 LIMIT 1`, [roomId]);
  return row.rows[0] as ChatCallRoom;
}

export async function endChatCallRoom(roomId: number, endedByUserId: number) {
  const res = await query(
    `
    UPDATE chat_call_rooms
    SET status = 'ended', ended_by_user_id = $2, ended_at = NOW(), updated_at = NOW()
    WHERE id = $1
      AND status IN ('active', 'scheduled')
    RETURNING *
    `,
    [roomId, endedByUserId],
  );
  return (res.rows[0] as ChatCallRoom | undefined) ?? null;
}

export async function listConversationCallRooms(conversationId: number, limit = 25) {
  const rows = await query(
    `
    SELECT *
    FROM chat_call_rooms
    WHERE conversation_id = $1
      AND status <> 'cancelled'
    ORDER BY start_at ASC, id ASC
    LIMIT $2
    `,
    [conversationId, Math.max(1, Math.min(100, Math.trunc(limit)))],
  );
  return (rows.rows as ChatCallRoom[]).map((row) => ({
    ...row,
    mode: modeFromTitle(row.title, row.mode),
  }));
}

export async function listUserUpcomingAndRecentCalls(userId: number, limit = 10) {
  const upcoming = await query(
    `
    SELECT
      r.*,
      c.name AS conversation_name
    FROM chat_call_rooms r
    JOIN conversations c ON c.id = r.conversation_id
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
    WHERE r.status IN ('scheduled', 'active')
      AND r.start_at >= NOW() - INTERVAL '2 hours'
    ORDER BY r.start_at ASC
    LIMIT $2
    `,
    [userId, limit],
  );
  const recent = await query(
    `
    SELECT
      r.*,
      c.name AS conversation_name
    FROM chat_call_rooms r
    JOIN conversations c ON c.id = r.conversation_id
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
    WHERE r.status = 'ended'
      AND COALESCE(r.ended_at, r.end_at) >= NOW() - INTERVAL '14 days'
    ORDER BY COALESCE(r.ended_at, r.end_at) DESC
    LIMIT 5
    `,
    [userId],
  );
  return {
    upcoming: upcoming.rows as Array<ChatCallRoom & { conversation_name: string | null }>,
    recent: recent.rows as Array<ChatCallRoom & { conversation_name: string | null }>,
  };
}

