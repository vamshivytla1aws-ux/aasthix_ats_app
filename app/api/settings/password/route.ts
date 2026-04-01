import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/settings/password
 * Change current user's password.
 * Body: { current_password: string, new_password: string }
 */
export async function PATCH(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const currentPassword: string = body.current_password || "";
    const newPassword: string = body.new_password || "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Both passwords required" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Verify current password
    const userRes = await query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [access.user_id]
    );
    if (userRes.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const storedHash = (userRes.rows[0] as { password_hash: string | null }).password_hash;

    let bcrypt: { compare: (a: string, b: string) => Promise<boolean>; hash: (a: string, b: number) => Promise<string> };
    try {
      bcrypt = await import("bcryptjs");
    } catch {
      return NextResponse.json({ error: "Password service unavailable" }, { status: 500 });
    }

    if (storedHash) {
      const valid = await bcrypt.compare(currentPassword, storedHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, access.user_id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("settings/password PATCH", error);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
