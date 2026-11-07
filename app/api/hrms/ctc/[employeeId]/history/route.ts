import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { listEmployeeCtcHistory } from "@/lib/salary/service";
import { canAccessSalaryEmployee } from "@/lib/salary/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { employeeId: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const employeeId = Number(params.employeeId);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return NextResponse.json({ operation_status: "blocked", user_message: "Invalid employee id." }, { status: 400 });
  }
  const allowed = await canAccessSalaryEmployee(auth.access, employeeId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const history = await listEmployeeCtcHistory(employeeId);
  return NextResponse.json({ operation_status: "success", history });
}

