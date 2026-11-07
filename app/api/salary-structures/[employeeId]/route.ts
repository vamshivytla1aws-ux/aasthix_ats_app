import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getLatestSalaryStructure, getSalaryStructureForMonth } from "@/lib/salary/service";
import { canAccessSalaryEmployee } from "@/lib/salary/access";
import { employeeSalaryOverview } from "@/lib/salary/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { employeeId: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const employeeId = Number(params.employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
  }
  if (!await canAccessSalaryEmployee(auth.access, employeeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const month = new URL(request.url).searchParams.get("month");
  if (month !== null && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000)) {
    return NextResponse.json({ error: "Select a valid salary month." }, { status: 400 });
  }
  try {
    const data = month ? await getSalaryStructureForMonth(employeeId, Number(month.slice(5)), Number(month.slice(0, 4)))
      : await getLatestSalaryStructure(employeeId);
    if (!data) return NextResponse.json({ error: "Salary structure not found" }, { status: 404 });
    return NextResponse.json(auth.access.role === "employee" ? employeeSalaryOverview(data) : data);
  } catch (error) {
    console.error("Unable to load salary structure", error);
    return NextResponse.json({ error: "Unable to load the salary setup. Please try again." }, { status: 500 });
  }
}
