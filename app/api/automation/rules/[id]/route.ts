import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AUTOMATION_V3_ENABLED } from "@/lib/featureFlags";
import { updateAutomationRule } from "@/lib/phase3/automation";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AUTOMATION_V3_ENABLED) {
    return NextResponse.json({
      enabled: false,
      message: "AUTOMATION_V3_ENABLED is disabled",
      operation_status: "blocked",
    });
  }
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
  try {
    const body = await request.json().catch(() => ({}));
    const rule = await updateAutomationRule({
      id,
      actorUserId: auth.access.user_id,
      mode: body?.mode,
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
      paused: typeof body?.paused === "boolean" ? body.paused : undefined,
      config: body?.config && typeof body.config === "object" ? body.config : undefined,
    });
    return NextResponse.json({
      operation_status: "success",
      rule,
    });
  } catch (error) {
    console.error("PUT /api/automation/rules/:id", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update rule" }, { status: 500 });
  }
}
