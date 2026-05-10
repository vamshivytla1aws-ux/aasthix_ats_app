import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ORG_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { createWorkspace, listWorkspaces } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, workspaces: [] });
  try {
    const workspaces = await listWorkspaces();
    return NextResponse.json({ enabled: true, workspaces });
  } catch (error) {
    console.error("GET /api/org/workspaces", error);
    return NextResponse.json({ error: "Failed to load workspaces" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, workspace: null });
  try {
    const body = await request.json().catch(() => ({}));
    const workspace = await createWorkspace({
      business_unit: String(body?.business_unit || "general"),
      workspace_key: String(body?.workspace_key || `workspace-${Date.now()}`),
      workspace_name: String(body?.workspace_name || "Workspace"),
      settings: body?.settings && typeof body.settings === "object" ? body.settings : {},
    });
    return NextResponse.json({ enabled: true, workspace });
  } catch (error) {
    console.error("POST /api/org/workspaces", error);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }
}
