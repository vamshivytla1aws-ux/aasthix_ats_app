import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { getWorkspaceLayout, updateWorkspaceLayout } from "@/lib/workspace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const layout = await getWorkspaceLayout(access.user_id);
    return NextResponse.json({ layout });
  } catch (error) {
    console.error("GET /api/workspace/layout", error);
    return NextResponse.json({ error: "Failed to load workspace layout" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const modules = body?.modules ?? {};
    const dashboard = body?.dashboard ?? { widgets: [], hidden_widgets: [] };
    const layout = await updateWorkspaceLayout(access.user_id, modules, dashboard);
    return NextResponse.json({ layout });
  } catch (error) {
    console.error("PUT /api/workspace/layout", error);
    return NextResponse.json({ error: "Failed to update workspace layout" }, { status: 500 });
  }
}
