import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getLeaveDashboard } from "@/lib/leave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("leave.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const dashboard = await getLeaveDashboard(auth.access.user_id);
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("GET /api/leave/dashboard/me", error);
    return NextResponse.json({ error: "Failed to load leave dashboard." }, { status: 500 });
  }
}
