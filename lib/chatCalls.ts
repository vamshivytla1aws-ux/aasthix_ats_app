import { query } from "@/lib/db";
import { buildPublicUrl } from "@/lib/publicUrl";
import { logCallEvent } from "@/lib/chatCallGovernance";

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

const REQUIRED_CHAT_SIGNAL_TYPES = [
  "offer",
  "answer",
  "ice",
  "leave",
  "presenting",
  "media_repair",
  "moderation_mute",
  "moderation_unmute",
  "moderation_remove",
  "moderation_end",
] as const;

export async function getChatCallSignalSchemaHealth() {
  const res = await query(
    `
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'chat_call_signals_type_chk'
      AND conrelid = 'chat_call_signals'::regclass
    LIMIT 1
    `,
  );
  const def = String((res.rows[0] as { def?: string } | undefined)?.def || "");
  const missingTypes = REQUIRED_CHAT_SIGNAL_TYPES.filter((type) => !def.includes(`'${type}'`));
  return {
    schema_ready: missingTypes.length === 0,
    missing_types: missingTypes,
    required_types: [...REQUIRED_CHAT_SIGNAL_TYPES],
  };
}

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

export async function closeChatCallRoomTransactional(input: {
  roomId: number;
  conversationId: number;
  endedByUserId: number | null;
  reason: "ended" | "moderator_end" | "last_participant_left" | "timeout";
  systemMessage: string;
  messageSenderId?: number | null;
  eventUserId?: number | null;
  eventKey: string;
  correlationId?: string | null;
}) {
  const closeRes = await query(
    `
    WITH closed_room AS (
      UPDATE chat_call_rooms
      SET status = 'ended',
          ended_by_user_id = COALESCE($3, ended_by_user_id),
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND status IN ('active', 'scheduled')
      RETURNING id
    ),
    closed_participants AS (
      UPDATE chat_call_participants
      SET left_at = NOW()
      WHERE room_id = $1
        AND left_at IS NULL
      RETURNING user_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM closed_room) AS room_closed,
      (SELECT COUNT(*)::int FROM closed_participants) AS participants_closed
    `,
    [input.roomId, input.conversationId, input.endedByUserId],
  );
  const roomClosed = Number((closeRes.rows[0] as { room_closed?: number } | undefined)?.room_closed || 0) > 0;
  if (!roomClosed) {
    return { closed: false, participants_closed: 0, event_accepted: false };
  }
  const eventAccepted = await logCallEvent({
    roomId: input.roomId,
    conversationId: input.conversationId,
    userId: input.eventUserId ?? input.endedByUserId ?? null,
    eventType: "end",
    metadata: { reason: input.reason },
    eventKey: input.eventKey,
    correlationId: input.correlationId,
  });
  if (eventAccepted) {
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [input.conversationId, input.messageSenderId ?? null, input.systemMessage],
    );
  }
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [input.conversationId]);
  return {
    closed: true,
    participants_closed: Number((closeRes.rows[0] as { participants_closed?: number } | undefined)?.participants_closed || 0),
    event_accepted: eventAccepted,
  };
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
