import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/conversations/[id]/members
 * Add members to a group conversation.
 * Body: { user_ids: number[] }
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const convId = Number(params.id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    // Verify caller is member
    const memberCheck = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [convId, access.user_id]
    );
    if (!memberCheck.rowCount) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    // Verify it's a group
    const convCheck = await query(`SELECT type FROM conversations WHERE id = $1`, [convId]);
    if (!convCheck.rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((convCheck.rows[0] as { type: string }).type !== "group") {
      return NextResponse.json({ error: "Cannot add members to a direct chat" }, { status: 400 });
    }

    const body = await request.json();
    const userIds: number[] = body.user_ids || [];
    if (userIds.length === 0) return NextResponse.json({ error: "user_ids required" }, { status: 400 });

    const added: number[] = [];
    for (const uid of userIds) {
      const res = await query(
        `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id`,
        [convId, uid]
      );
      if (res.rowCount && res.rowCount > 0) added.push(uid);
    }

    if (added.length > 0) {
      const namesRes = await query(
        `SELECT full_name FROM users WHERE id = ANY($1)`,
        [added]
      );
      const names = (namesRes.rows as Array<{ full_name: string }>).map((r) => r.full_name).join(", ");
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
        [convId, access.user_id, `Added ${names} to the group`]
      );
      await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [convId]);
    }

    return NextResponse.json({ added });
  } catch (error) {
    console.error("chat/members POST", error);
    return NextResponse.json({ error: "Failed to add members" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/conversations/[id]/members
 * Leave a group conversation. Body: { user_id?: number }
 * If user_id is omitted, the current user leaves.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const convId = Number(params.id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const targetUserId = (body as { user_id?: number }).user_id ?? access.user_id;

    await query(
      `DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [convId, targetUserId]
    );

    const userRes = await query(`SELECT full_name FROM users WHERE id = $1`, [targetUserId]);
    const name = (userRes.rows[0] as { full_name: string } | undefined)?.full_name ?? "Someone";

    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [convId, access.user_id, `${name} left the group`]
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [convId]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("chat/members DELETE", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
