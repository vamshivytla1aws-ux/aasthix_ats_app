import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ORG_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { createWorkspace, listWorkspaces } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      workspaces: [],
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Workspace governance is disabled by flag.",
      trace_id: `org-workspaces-${Date.now()}`,
    });
  }
  try {
    const workspaces = await listWorkspaces();
    return NextResponse.json({
      enabled: true,
      workspaces,
      operation_status: "success",
      health_status: workspaces.length > 0 ? "healthy" : "warning",
      last_evaluated_at: new Date().toISOString(),
      owner: "org-admin",
      trace_id: `org-workspaces-${Date.now()}`,
    });
  } catch (error) {
    console.error("GET /api/org/workspaces", error);
    return NextResponse.json({ error: "Failed to load workspaces" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      workspace: null,
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Workspace governance is disabled by flag.",
      trace_id: `org-workspaces-create-${Date.now()}`,
    });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const workspace = await createWorkspace({
      business_unit: String(body?.business_unit || "general"),
      workspace_key: String(body?.workspace_key || `workspace-${Date.now()}`),
      workspace_name: String(body?.workspace_name || "Workspace"),
      settings: body?.settings && typeof body.settings === "object" ? body.settings : {},
    });
    return NextResponse.json({
      enabled: true,
      workspace,
      operation_status: "success",
      user_message: "Workspace created.",
      health_status: "healthy",
      last_evaluated_at: new Date().toISOString(),
      owner: "org-admin",
      trace_id: `org-workspaces-create-${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /api/org/workspaces", error);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }
}
