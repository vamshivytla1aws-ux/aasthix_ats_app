import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_LEN = 8;

/**
 * POST /api/admin/users/password
 * Admin-only: set password_hash for a user (bcrypt). Works with any Postgres host (e.g. Railway).
 * Body: { user_id: number, new_password: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { user_id, new_password } = body as { user_id?: unknown; new_password?: unknown };

    const uid = typeof user_id === "number" ? user_id : Number(user_id);
    if (!Number.isFinite(uid) || uid <= 0) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const password = typeof new_password === "string" ? new_password : "";
    if (password.length < MIN_LEN) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_LEN} characters` },
        { status: 400 }
      );
    }

    const existing = await query(`SELECT id, email FROM users WHERE id = $1`, [uid]);
    if (existing.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const target = existing.rows[0] as { id: number; email: string };
    const password_hash = await bcrypt.hash(password, 12);

    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      password_hash,
      uid,
    ]);

    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "admin.password_reset",
      metadata: { target_user_id: uid, target_email: target.email },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin/users/password POST", error);
    return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
  }
}
