import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("leave.manage_policy");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const res = await query(
      `SELECT id, full_name, email, role FROM users ORDER BY LOWER(full_name) ASC, id ASC`,
      [],
    );
    return NextResponse.json({ users: res.rows });
  } catch (error) {
    console.error("GET /api/leave/users", error);
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }
}
