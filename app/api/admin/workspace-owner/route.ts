import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireWorkspaceOwner } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireWorkspaceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json() as { target_user_id?: number; confirm_email?: string };
  const targetUserId = Number(body.target_user_id);
  const confirmEmail = String(body.confirm_email || "").trim().toLowerCase();
  if (!Number.isInteger(targetUserId) || !confirmEmail) {
    return NextResponse.json({ error: "target_user_id and confirm_email are required" }, { status: 400 });
  }
  const configuredOwner = process.env.WORKSPACE_OWNER_EMAIL?.trim().toLowerCase();
  if (configuredOwner && configuredOwner !== confirmEmail) {
    return NextResponse.json(
      { error: `Update WORKSPACE_OWNER_EMAIL to ${confirmEmail} before transferring ownership.` },
      { status: 409 },
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query(
      `SELECT id, email, COALESCE(is_active, true) AS is_active FROM users WHERE id = $1 FOR UPDATE`,
      [targetUserId],
    );
    if (!targetResult.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }
    const target = targetResult.rows[0] as { id: number; email: string; is_active: boolean };
    if (!target.is_active || target.email.trim().toLowerCase() !== confirmEmail) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Confirmation email does not match an active target user" }, { status: 409 });
    }
    await client.query(
      `UPDATE users SET role = 'admin', token_version = token_version + 1, updated_at = NOW() WHERE id = $1`,
      [auth.access.user_id],
    );
    await client.query(
      `UPDATE users SET role = 'workspace_owner', access_scope = 'all', token_version = token_version + 1,
                        is_active = true, deactivated_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [targetUserId],
    );
    await client.query("COMMIT");
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "rbac.workspace_owner_transferred",
      metadata: { previous_owner_user_id: auth.access.user_id, target_user_id: targetUserId, target_email: confirmEmail },
    });
    return NextResponse.json({ ok: true, owner_user_id: targetUserId });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("workspace owner transfer", error);
    return NextResponse.json({ error: "Failed to transfer workspace ownership" }, { status: 500 });
  } finally {
    client.release();
  }
}
