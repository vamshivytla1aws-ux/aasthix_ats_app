import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { getEmployeeCompliance } from "@/lib/hrms/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const employeeIdFromQuery = Number(url.searchParams.get("employeeId") || 0);
  const employeeId = employeeIdFromQuery > 0 ? employeeIdFromQuery : access.user_id;

  if (access.role === "employee" && employeeId !== access.user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (access.role === "hiring_manager" || access.role === "manager") {
    if (employeeId !== access.user_id && !access.permissions["documents.view_team"]) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const compliance = await getEmployeeCompliance({ employeeId });
  if (!compliance) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  return NextResponse.json({ compliance });
}
