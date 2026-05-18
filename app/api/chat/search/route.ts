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

    if (!q) return NextResponse.json({ results: [] });
    if (scope === "conversation" && !Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "conversation_id is required for conversation scope" }, { status: 400 });
    }

    const params: Array<string | number> = [access.user_id, `%${q}%`];
    let conversationFilter = "";
    if (scope === "conversation") {
      params.push(conversationId);
      conversationFilter = ` AND m.conversation_id = $${params.length}`;
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
       WHERE m.content ILIKE $2
         AND m.parent_message_id IS NULL
         ${conversationFilter}
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

