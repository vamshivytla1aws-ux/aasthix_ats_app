import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/conversations
 * List conversations the current user is a member of, ordered by last activity.
 * Includes last message preview and unread count.
 *
 * Optional: ?search=term  to filter by conversation name or member name.
 */
export async function GET(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";

    const res = await query(
      `WITH member_conversations AS (
         SELECT
           c.id,
           c.name,
           c.type,
           c.created_by,
           c.created_at,
           c.updated_at,
           cm.last_read_at,
           COALESCE(ccp.muted, FALSE) AS muted,
           COALESCE(ccp.mention_only, FALSE) AS mention_only
         FROM conversations c
         JOIN conversation_members cm
           ON cm.conversation_id = c.id
          AND cm.user_id = $1
         LEFT JOIN chat_conversation_preferences ccp
           ON ccp.conversation_id = c.id
          AND ccp.user_id = $1
       ),
       unread_counts AS (
         SELECT
           mc.id AS conversation_id,
           COUNT(m.id)::int AS unread_count
         FROM member_conversations mc
         LEFT JOIN messages m
           ON m.conversation_id = mc.id
          AND m.created_at > mc.last_read_at
         GROUP BY mc.id
       ),
       pin_counts AS (
         SELECT
           cp.conversation_id,
           COUNT(*)::int AS pin_count
         FROM conversation_pins cp
         JOIN member_conversations mc ON mc.id = cp.conversation_id
         GROUP BY cp.conversation_id
       ),
       last_messages AS (
         SELECT DISTINCT ON (m.conversation_id)
           m.conversation_id,
           jsonb_build_object(
             'id', m.id,
             'content', m.content,
             'sender_id', m.sender_id,
             'is_system', m.is_system,
             'created_at', m.created_at,
             'sender_name', u.full_name
           ) AS last_message
         FROM messages m
         JOIN member_conversations mc ON mc.id = m.conversation_id
         JOIN users u ON u.id = m.sender_id
         ORDER BY m.conversation_id, m.created_at DESC
       ),
       member_lists AS (
         SELECT
           cm2.conversation_id,
           jsonb_agg(
             jsonb_build_object(
               'user_id', mu.id,
               'full_name', mu.full_name,
               'email', mu.email
             )
             ORDER BY mu.full_name
           ) AS members
         FROM conversation_members cm2
         JOIN member_conversations mc ON mc.id = cm2.conversation_id
         JOIN users mu ON mu.id = cm2.user_id
         GROUP BY cm2.conversation_id
       )
       SELECT
         mc.id,
         mc.name,
         mc.type,
         mc.created_by,
         mc.created_at,
         mc.updated_at,
         mc.last_read_at,
         mc.muted,
         mc.mention_only,
         COALESCE(uc.unread_count, 0) AS unread_count,
         COALESCE(pc.pin_count, 0) AS pin_count,
         lm.last_message,
         COALESCE(ml.members, '[]'::jsonb) AS members
       FROM member_conversations mc
       LEFT JOIN unread_counts uc ON uc.conversation_id = mc.id
       LEFT JOIN pin_counts pc ON pc.conversation_id = mc.id
       LEFT JOIN last_messages lm ON lm.conversation_id = mc.id
       LEFT JOIN member_lists ml ON ml.conversation_id = mc.id
       ORDER BY mc.updated_at DESC`,
      [access.user_id]
    );

    let conversations: Array<Record<string, unknown>> = (res.rows as Array<Record<string, unknown>>).map((row) => {
      const members = Array.isArray(row.members) ? row.members : [];
      if (!Array.isArray(row.members) && Math.random() < 0.05) {
        console.warn("[chat/conversations] normalized malformed members payload", {
          conversation_id: row.id,
          had_members: typeof row.members,
        });
      }
      return {
        ...row,
        members,
      };
    });

    if (search) {
      const lc = search.toLowerCase();
      conversations = conversations.filter((c) => {
        if (c.name && String(c.name).toLowerCase().includes(lc)) return true;
        const members = c.members as Array<{ full_name: string }> | null;
        return members?.some((m) => m.full_name.toLowerCase().includes(lc));
      });
    }

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("chat/conversations GET", error);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}

/**
 * POST /api/chat/conversations
 * Create a new conversation.
 * Body: { type: "direct" | "group", member_ids: number[], name?: string }
 *
 * For direct chats, if a 1:1 conversation already exists between the two users,
 * returns the existing one instead of creating a duplicate.
 */
export async function POST(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const body = await request.json();
    const type: string = body.type || "direct";
    const memberIds: number[] = body.member_ids || [];
    const name: string | null = body.name?.trim() || null;

    if (!["direct", "group"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (memberIds.length === 0) {
      return NextResponse.json({ error: "member_ids required" }, { status: 400 });
    }

    const allMembers = Array.from(new Set([access.user_id, ...memberIds]));

    if (type === "direct") {
      if (allMembers.length !== 2) {
        return NextResponse.json({ error: "Direct chat requires exactly 2 members" }, { status: 400 });
      }

      // Check for existing direct conversation between these two users
      const existingRes = await query(
        `SELECT c.id
         FROM conversations c
         WHERE c.type = 'direct'
           AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
           AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $1)
           AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2)
         LIMIT 1`,
        [allMembers[0], allMembers[1]]
      );

      if (existingRes.rowCount && existingRes.rowCount > 0) {
        return NextResponse.json({ conversation_id: existingRes.rows[0].id, existing: true });
      }
    }

    if (type === "group" && allMembers.length < 2) {
      return NextResponse.json({ error: "Group chat needs at least 2 members" }, { status: 400 });
    }

    // Create conversation
    const convRes = await query(
      `INSERT INTO conversations (name, type, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [name, type, access.user_id]
    );
    const convId = (convRes.rows[0] as { id: number }).id;

    // Add members
    for (const uid of allMembers) {
      await query(
        `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [convId, uid]
      );
    }

    // System message
    const memberNames = await getMemberNames(allMembers);
    const creatorName = memberNames.find((m) => m.id === access.user_id)?.full_name ?? "Someone";
    const systemMsg = type === "group"
      ? `${creatorName} created the group "${name || "Unnamed group"}"`
      : `${creatorName} started a conversation`;

    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [convId, access.user_id, systemMsg]
    );

    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [convId]);

    return NextResponse.json({ conversation_id: convId, existing: false }, { status: 201 });
  } catch (error) {
    console.error("chat/conversations POST", error);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}

async function getMemberNames(ids: number[]) {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const res = await query(
    `SELECT id, full_name FROM users WHERE id IN (${placeholders})`,
    ids
  );
  return res.rows as Array<{ id: number; full_name: string }>;
}
