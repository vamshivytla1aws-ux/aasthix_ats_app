import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const values: number[] = [];
  let where = "";
  if (access.role === "employee") {
    where = "WHERE w.user_id = $1";
    values.push(access.user_id);
  } else if (access.role === "hiring_manager" || access.role === "manager") {
    where = "WHERE w.manager_user_id = $1 OR w.user_id = $1";
    values.push(access.user_id);
  }
  const res = await query(
    `
      SELECT w.*, COALESCE(u.full_name, '') AS user_name
      FROM wfh_requests w
      JOIN users u ON u.id = w.user_id
      ${where}
      ORDER BY w.created_at DESC
    `,
    values,
  );
  return NextResponse.json({ requests: res.rows });
}

export async function POST(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as
    | { fromDate?: string; toDate?: string; reason?: string; managerUserId?: number | null }
    | null;
  if (!body || !body.fromDate || !body.toDate || !body.reason?.trim()) {
    return NextResponse.json({ error: "fromDate, toDate, and reason are required." }, { status: 400 });
  }
  await query(
    `
      INSERT INTO wfh_requests
      (user_id, from_date, to_date, reason, manager_user_id, status, created_at, updated_at)
      VALUES ($1,$2::date,$3::date,$4,$5,'pending',NOW(),NOW())
    `,
    [access.user_id, body.fromDate, body.toDate, body.reason.trim(), body.managerUserId || null],
  );
  await writeAuditLog({
    actorUserId: access.user_id,
    action: "hrms.wfh.requested",
    metadata: { from_date: body.fromDate, to_date: body.toDate },
  });
  return NextResponse.json({ operation_status: "success", user_message: "WFH request submitted." });
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("wfh.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { id?: number; decision?: "approved" | "rejected"; note?: string | null } | null;
  if (!body || !Number(body.id) || !(body.decision === "approved" || body.decision === "rejected")) {
    return NextResponse.json({ error: "id and valid decision are required." }, { status: 400 });
  }
  await query(
    `
      UPDATE wfh_requests
      SET status = $2, decision_note = $3, decided_by_user_id = $4, decided_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [Number(body.id), body.decision, body.note || null, auth.access.user_id],
  );
  await writeAuditLog({
    actorUserId: auth.access.user_id,
    action: "hrms.wfh.decided",
    metadata: { request_id: Number(body.id), decision: body.decision },
  });
  return NextResponse.json({ operation_status: "success", user_message: `WFH request ${body.decision}.` });
}
