import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { CALIBRATION_V3_ENABLED } from "@/lib/featureFlags";
import { getScorecardTemplate, upsertScorecardTemplate } from "@/lib/phase3/scorecards";
import { recordPhase3AuditEvent } from "@/lib/phase3/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("interviews.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!CALIBRATION_V3_ENABLED) return NextResponse.json({ enabled: false, operation_status: "blocked", template: null });
  const url = new URL(request.url);
  const jobId = Number(url.searchParams.get("job_id"));
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "job_id query param is required" }, { status: 400 });
  }
  try {
    const template = await getScorecardTemplate(jobId);
    return NextResponse.json({ enabled: true, operation_status: "success", template });
  } catch (error) {
    console.error("GET /api/interviews/scorecard-template", error);
    return NextResponse.json({ error: "Failed to load scorecard template" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission("interviews.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!CALIBRATION_V3_ENABLED) return NextResponse.json({ enabled: false, operation_status: "blocked", template: null });
  try {
    const body = await request.json();
    const jobId = Number(body?.job_id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }
    const template = body?.template && typeof body.template === "object" ? body.template : {};
    const saved = await upsertScorecardTemplate(jobId, template, auth.access.user_id);
    await recordPhase3AuditEvent({
      actorUserId: auth.access.user_id,
      action: "phase3.scorecard.template_updated",
      metadata: { job_id: jobId },
    });
    return NextResponse.json({ enabled: true, operation_status: "success", template: saved });
  } catch (error) {
    console.error("PUT /api/interviews/scorecard-template", error);
    return NextResponse.json({ error: "Failed to update scorecard template" }, { status: 500 });
  }
}
