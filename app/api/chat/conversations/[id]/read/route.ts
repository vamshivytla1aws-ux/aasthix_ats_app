import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/chat/conversations/[id]/read
 * Mark a conversation as read (updates last_read_at to now).
 */
export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const convId = Number(params.id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await query(
      `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
      [convId, access.user_id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("chat/read PATCH", error);
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}
