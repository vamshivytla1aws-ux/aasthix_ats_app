import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { createCorrectionRequest, listCorrectionRequests, decideCorrectionRequest } from "@/lib/hrms/attendanceRules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = await listCorrectionRequests(access.user_id, access.role);
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as
    | {
        attendanceDate?: string;
        requestedCheckIn?: string | null;
        requestedCheckOut?: string | null;
        reason?: string;
        managerUserId?: number | null;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  if (!body.attendanceDate) return NextResponse.json({ error: "Attendance date is required." }, { status: 400 });
  if (!body.reason?.trim()) return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  const id = await createCorrectionRequest({
    userId: access.user_id,
    attendanceDate: body.attendanceDate,
    requestedCheckIn: body.requestedCheckIn || null,
    requestedCheckOut: body.requestedCheckOut || null,
    reason: body.reason.trim(),
    managerUserId: body.managerUserId || null,
  });
  return NextResponse.json({
    id,
    operation_status: "success",
    user_message: "Attendance correction submitted.",
  });
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("attendance_corrections.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as
    | { id?: number; decision?: "approved" | "rejected"; decisionNote?: string | null }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  if (!Number(body.id)) return NextResponse.json({ error: "Request id is required." }, { status: 400 });
  if (!(body.decision === "approved" || body.decision === "rejected")) {
    return NextResponse.json({ error: "Decision must be approved/rejected." }, { status: 400 });
  }
  await decideCorrectionRequest({
    id: Number(body.id),
    decision: body.decision,
    decisionNote: body.decisionNote || null,
    decidedByUserId: auth.access.user_id,
  });
  return NextResponse.json({
    operation_status: "success",
    user_message: `Correction ${body.decision}.`,
  });
}
