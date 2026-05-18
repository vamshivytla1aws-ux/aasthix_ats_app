import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireConversationMember } from "@/lib/chat/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    if (!(await requireConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const convRes = await query(
      `SELECT id, name, type, created_at, updated_at
       FROM conversations
       WHERE id = $1`,
      [conversationId]
    );
    if (!convRes.rowCount) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    const membersRes = await query(
      `SELECT u.id AS user_id, u.full_name, u.email
       FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = $1
       ORDER BY u.full_name`,
      [conversationId]
    );

    const fileCountRes = await query(
      `SELECT COUNT(*)::int AS file_count
       FROM messages
       WHERE conversation_id = $1
         AND attachment_url IS NOT NULL`,
      [conversationId]
    );
    const imageCountRes = await query(
      `SELECT COUNT(*)::int AS image_count
       FROM messages
       WHERE conversation_id = $1
         AND attachment_url IS NOT NULL
         AND attachment_type IN ('image', 'gif')`,
      [conversationId]
    );

    return NextResponse.json({
      conversation: convRes.rows[0],
      members: membersRes.rows,
      stats: {
        shared_files: Number((fileCountRes.rows[0] as { file_count: number })?.file_count ?? 0),
        shared_images: Number((imageCountRes.rows[0] as { image_count: number })?.image_count ?? 0),
      },
    });
  } catch (error) {
    console.error("chat/details GET", error);
    return NextResponse.json({ error: "Failed to load conversation details" }, { status: 500 });
  }
}

