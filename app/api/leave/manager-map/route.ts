import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { setManagerMapping } from "@/lib/leave";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("leave.manage_policy");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const res = await query(
      `SELECT emm.user_id, u.full_name AS user_name, emm.manager_user_id, mu.full_name AS manager_name, emm.updated_at
       FROM employee_manager_map emm
       JOIN users u ON u.id = emm.user_id
       JOIN users mu ON mu.id = emm.manager_user_id
       ORDER BY u.full_name ASC`,
      [],
    );
    return NextResponse.json({ mappings: res.rows });
  } catch (error) {
    console.error("GET /api/leave/manager-map", error);
    return NextResponse.json({ error: "Failed to load manager mappings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission("leave.manage_policy");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = (await request.json().catch(() => null)) as { user_id?: number; manager_user_id?: number } | null;
    if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    const userId = Number(body.user_id);
    const managerUserId = Number(body.manager_user_id);
    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(managerUserId) || managerUserId <= 0) {
      return NextResponse.json({ error: "Valid user_id and manager_user_id are required." }, { status: 400 });
    }
    await setManagerMapping(auth.access.user_id, userId, managerUserId);
    return NextResponse.json({
      operation_status: "success",
      user_message: "Manager mapping updated.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update manager mapping.",
        operation_status: "error",
        user_message: "Manager mapping update failed.",
      },
      { status: 400 },
    );
  }
}
