import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getAuthAccess();
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await query(
      `SELECT id, full_name, email, role FROM users WHERE id = $1`,
      [access.user_id]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    return NextResponse.json({
      user: {
        ...result.rows[0],
        role: access.role,
      },
      permissions: access.permissions,
    });
  } catch (e) {
    console.error("Error fetching me", e);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

