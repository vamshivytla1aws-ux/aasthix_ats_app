import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getEmployeeSelfProfile } from "@/lib/hrms/employeeDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("employee_directory.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const profile = await getEmployeeSelfProfile(auth.access.user_id);
    if (!profile) return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("GET /api/hrms/profile/me", error);
    return NextResponse.json({ error: "Failed to load employee profile." }, { status: 500 });
  }
}
