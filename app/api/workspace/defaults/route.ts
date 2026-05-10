import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { getWorkspaceDefaults } from "@/lib/workspace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const defaults = await getWorkspaceDefaults(access.role);
    return NextResponse.json({ defaults });
  } catch (error) {
    console.error("GET /api/workspace/defaults", error);
    return NextResponse.json({ error: "Failed to load workspace defaults" }, { status: 500 });
  }
}
