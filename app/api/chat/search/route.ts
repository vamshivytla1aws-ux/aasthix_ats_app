import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const scope = (searchParams.get("scope") || "all").trim();
    const conversationId = Number(searchParams.get("conversation_id"));
    const senderId = Number(searchParams.get("sender_id"));
    const hasAttachment = searchParams.get("has_attachment");
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    if (!q) return NextResponse.json({ results: [] });
    if (scope === "conversation" && !Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "conversation_id is required for conversation scope" }, { status: 400 });
    }

    const params: Array<string | number> = [access.user_id, `%${q}%`];
    let filter = "";
    if (scope === "conversation") {
      params.push(conversationId);
      filter += ` AND m.conversation_id = $${params.length}`;
    }
    if (Number.isFinite(senderId)) {
      params.push(senderId);
      filter += ` AND m.sender_id = $${params.length}`;
    }
    if (hasAttachment === "true") {
      filter += ` AND m.attachment_url IS NOT NULL`;
    } else if (hasAttachment === "false") {
      filter += ` AND m.attachment_url IS NULL`;
    }
    if (fromDate) {
      params.push(fromDate);
      filter += ` AND m.created_at >= $${params.length}::timestamptz`;
    }
    if (toDate) {
      params.push(toDate);
      filter += ` AND m.created_at <= $${params.length}::timestamptz`;
    }

    const res = await query(
      `SELECT
         m.id,
         m.conversation_id,
         m.content,
         m.created_at,
         m.sender_id,
         u.full_name AS sender_name,
         c.name AS conversation_name,
         c.type AS conversation_type
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN conversations c ON c.id = m.conversation_id
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       WHERE (
         m.content ILIKE $2
         OR EXISTS (
           SELECT 1
           FROM message_mentions mm
           WHERE mm.message_id = m.id
             AND mm.label ILIKE $2
         )
       )
         AND m.parent_message_id IS NULL
         ${filter}
       ORDER BY m.created_at DESC
       LIMIT 60`,
      params
    );

    return NextResponse.json({ results: res.rows });
  } catch (error) {
    console.error("chat/search GET", error);
    return NextResponse.json({ error: "Failed to search chat messages" }, { status: 500 });
  }
}
