import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { readEmployeeMonth, monthWindow } from "@/lib/hrms/employeeMonth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employeeId = Number(params.id), month = new URL(request.url).searchParams.get("month") || "";
  if (!Number.isInteger(employeeId) || employeeId <= 0) return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  // Reject other-employee probes before loading their identity.
  if (access.role === "employee" && employeeId !== access.user_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { monthWindow(month); } catch { return NextResponse.json({ error: "Select a valid month." }, { status: 400 }); }
  try {
    const result = await readEmployeeMonth(access, employeeId, month);
    return NextResponse.json("data" in result ? result.data : { error: result.error }, { status: result.status });
  } catch (error) {
    console.error("Employee monthly records failed", error);
    return NextResponse.json({ error: "Unable to load monthly records. Please try again." }, { status: 500 });
  }
}
