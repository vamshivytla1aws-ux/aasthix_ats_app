import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/unread
 * Returns total unread message count across all conversations for the current user.
 */
export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const res = await query(
      `SELECT COALESCE(SUM(cnt), 0)::int AS total_unread
       FROM (
         SELECT (
           SELECT COUNT(*) FROM messages m
           WHERE m.conversation_id = cm.conversation_id AND m.created_at > cm.last_read_at
         ) AS cnt
         FROM conversation_members cm
         WHERE cm.user_id = $1
       ) sub`,
      [access.user_id]
    );

    const total = (res.rows[0] as { total_unread: number }).total_unread;

    return NextResponse.json({ total_unread: total });
  } catch (error) {
    console.error("chat/unread GET", error);
    return NextResponse.json({ total_unread: 0 });
  }
}
