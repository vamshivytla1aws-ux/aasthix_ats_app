import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { createLeaveRequest, listLeaveRequests } from "@/lib/leave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("leave.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const rows = await listLeaveRequests(auth.access.user_id, auth.access.role);
    return NextResponse.json({ requests: rows });
  } catch (error) {
    console.error("GET /api/leave/requests", error);
    return NextResponse.json({ error: "Failed to load leave requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("leave.apply_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = (await request.json().catch(() => null)) as
      | { leave_type?: string; from_date?: string; to_date?: string; reason?: string | null }
      | null;
    if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    const leaveRequest = await createLeaveRequest({
      userId: auth.access.user_id,
      leaveType: (body.leave_type || "").toLowerCase() as "sick" | "casual",
      fromDate: String(body.from_date || ""),
      toDate: String(body.to_date || ""),
      reason: body.reason || null,
    });
    return NextResponse.json({
      request: leaveRequest,
      operation_status: "success",
      user_message: "Leave request submitted to manager.",
      hint: "You will see updates in My Leave Dashboard.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to submit leave request.",
        operation_status: "error",
        user_message: "Leave request could not be submitted.",
      },
      { status: 400 },
    );
  }
}
