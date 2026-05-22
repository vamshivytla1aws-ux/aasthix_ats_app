import { query } from "@/lib/db";

type Access = { user_id: number; role: string };

export type ChatCallPolicy = {
  call_start_scope: "all" | "manager_plus" | "admin_plus";
  call_share_scope: "all" | "host_only" | "host_manager";
  max_call_participants: number;
  allow_external_live_calls: boolean;
};

export async function getChatCallPolicy(): Promise<ChatCallPolicy> {
  const res = await query(
    `SELECT call_start_scope, call_share_scope, max_call_participants, allow_external_live_calls
     FROM chat_policies
     ORDER BY id DESC
     LIMIT 1`,
  );
  const row = res.rows[0] as Partial<ChatCallPolicy> | undefined;
  return {
    call_start_scope: (row?.call_start_scope as ChatCallPolicy["call_start_scope"]) || "all",
    call_share_scope: (row?.call_share_scope as ChatCallPolicy["call_share_scope"]) || "all",
    max_call_participants: Math.max(2, Number(row?.max_call_participants || 25)),
    allow_external_live_calls: Boolean(row?.allow_external_live_calls),
  };
}

function roleRank(role: string) {
  const r = String(role || "").toLowerCase();
  if (r === "admin") return 4;
  if (r === "hr" || r === "coordinator") return 3;
  if (r === "hiring_manager" || r === "recruiter") return 2;
  return 1;
}

export function canStartCallByPolicy(access: Access, policy: ChatCallPolicy) {
  if (policy.call_start_scope === "all") return true;
  if (policy.call_start_scope === "admin_plus") return roleRank(access.role) >= 4;
  return roleRank(access.role) >= 2;
}

export async function canShareByPolicy(input: {
  access: Access;
  roomId: number;
  policy: ChatCallPolicy;
}) {
  const { access, roomId, policy } = input;
  if (policy.call_share_scope === "all") return true;
  const roomRes = await query(
    `SELECT created_by_user_id FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
    [roomId],
  );
  const room = roomRes.rows[0] as { created_by_user_id: number | null } | undefined;
  const isHost = Number(room?.created_by_user_id || 0) === Number(access.user_id);
  if (policy.call_share_scope === "host_only") return isHost;
  if (isHost) return true;
  return roleRank(access.role) >= 2;
}

export function canModerateCall(access: Access, hostUserId: number | null) {
  const isHost = Number(hostUserId || 0) === Number(access.user_id);
  if (isHost) return true;
  return roleRank(access.role) >= 3;
}

export async function logCallEvent(input: {
  roomId: number;
  conversationId: number;
  userId?: number | null;
  eventType: string;
  metadata?: Record<string, unknown>;
  eventKey?: string;
}) {
  const args = [
    input.roomId,
    input.conversationId,
    input.userId ?? null,
    input.eventType,
    input.eventKey ?? null,
    JSON.stringify(input.metadata || {}),
  ];
  try {
    const res = await query(
      `
      INSERT INTO chat_call_events (room_id, conversation_id, user_id, event_type, event_key, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING 1
      `,
      args,
    );
    return res.rowCount > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/no unique or exclusion constraint matching the ON CONFLICT specification/i.test(message)) {
      throw error;
    }
    // Backward-compat fallback for DBs missing unique index on event_key.
    const res = await query(
      `
      INSERT INTO chat_call_events (room_id, conversation_id, user_id, event_type, event_key, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (event_key) DO NOTHING
      `,
      args,
    );
    return res.rowCount > 0;
  }
}
