import { NextResponse } from "next/server";
import { checkOutUser } from "@/lib/attendance";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requirePermission("attendance.manage_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const result = await checkOutUser(auth.access.user_id, "self");
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "attendance.check_out",
      metadata: {
        attendance_date: result.record?.attendance_date,
        total_minutes: result.record?.total_minutes,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/attendance/check-out", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to check out." }, { status: 400 });
  }
}
