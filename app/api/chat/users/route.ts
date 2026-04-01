import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/users
 * List all board users available for chat.
 * Optional: ?search=term to filter by name/email.
 */
export async function GET(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";

    let sql = `SELECT id, full_name, email, role FROM users ORDER BY full_name, id`;
    const params: string[] = [];

    if (search) {
      sql = `SELECT id, full_name, email, role FROM users WHERE full_name ILIKE $1 OR email ILIKE $1 ORDER BY full_name, id`;
      params.push(`%${search}%`);
    }

    const res = await query(sql, params);

    // Exclude current user from the list
    const users = (res.rows as Array<{ id: number; full_name: string; email: string; role: string }>)
      .filter((u) => u.id !== access.user_id);

    return NextResponse.json({ users, current_user_id: access.user_id });
  } catch (error) {
    console.error("chat/users GET", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
