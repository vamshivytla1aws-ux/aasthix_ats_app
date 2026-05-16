import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getLatestSalaryStructure } from "@/lib/salary/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { employeeId: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const employeeId = Number(params.employeeId);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
  }
  const data = await getLatestSalaryStructure(employeeId);
  if (!data) return NextResponse.json({ error: "Salary structure not found" }, { status: 404 });
  return NextResponse.json(data);
}
