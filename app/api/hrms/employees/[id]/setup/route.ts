import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getEmployeeSetup } from "@/lib/hrms/employeeSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("employee_directory.view_all");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  try {
    const data = await getEmployeeSetup(id, auth.access);
    return data ? NextResponse.json(data) : NextResponse.json({ error: "Employee not found." }, { status: 404 });
  } catch (error) {
    console.error("Employee setup status failed", error);
    return NextResponse.json({ error: "Unable to load setup status. Please try again." }, { status: 500 });
  }
}
