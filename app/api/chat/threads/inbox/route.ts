import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const res = await query(
      `SELECT
         pm.id AS parent_message_id,
         pm.conversation_id,
         c.name AS conversation_name,
         c.type AS conversation_type,
         pm.content AS parent_content,
         pm.created_at AS parent_created_at,
         u.full_name AS parent_sender_name,
         COUNT(r.id)::int AS reply_count,
         MAX(r.created_at) AS last_reply_at,
         COUNT(*) FILTER (WHERE r.created_at > cm.last_read_at)::int AS unread_replies
       FROM messages pm
       JOIN conversations c ON c.id = pm.conversation_id
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       JOIN users u ON u.id = pm.sender_id
       JOIN messages r ON r.parent_message_id = pm.id
       WHERE pm.parent_message_id IS NULL
       GROUP BY pm.id, pm.conversation_id, c.name, c.type, pm.content, pm.created_at, u.full_name, cm.last_read_at
       ORDER BY MAX(r.created_at) DESC
       LIMIT 80`,
      [access.user_id]
    );

    return NextResponse.json({ inbox: res.rows });
  } catch (error) {
    console.error("chat/thread inbox GET", error);
    return NextResponse.json({ error: "Failed to load thread inbox" }, { status: 500 });
  }
}

