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
      `SELECT
         c.id,
         c.name,
         c.type,
         c.created_by,
         c.created_at,
         c.updated_at,
         cm.last_read_at,
         COALESCE(ccp.muted, FALSE) AS muted,
         COALESCE(ccp.mention_only, FALSE) AS mention_only,
         (
           SELECT COUNT(*)::int FROM messages m
           WHERE m.conversation_id = c.id AND m.created_at > cm.last_read_at
         ) AS unread_count,
         (
           SELECT COUNT(*)::int FROM conversation_pins cp
           WHERE cp.conversation_id = c.id
         ) AS pin_count,
         (
           SELECT jsonb_build_object(
             'id', m.id,
             'content', m.content,
             'sender_id', m.sender_id,
             'is_system', m.is_system,
             'created_at', m.created_at,
             'sender_name', u.full_name
           )
           FROM messages m
           JOIN users u ON u.id = m.sender_id
           WHERE m.conversation_id = c.id
           ORDER BY m.created_at DESC
           LIMIT 1
         ) AS last_message,
         (
           SELECT jsonb_agg(jsonb_build_object(
             'user_id', mu.id,
             'full_name', mu.full_name,
             'email', mu.email
           ) ORDER BY mu.full_name)
           FROM conversation_members cm2
           JOIN users mu ON mu.id = cm2.user_id
           WHERE cm2.conversation_id = c.id
         ) AS members
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       LEFT JOIN chat_conversation_preferences ccp
         ON ccp.conversation_id = c.id
        AND ccp.user_id = $1
       ORDER BY c.updated_at DESC`,
      [access.user_id]
    );

    let conversations = res.rows as Array<Record<string, unknown>>;

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
