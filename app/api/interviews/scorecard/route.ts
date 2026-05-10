import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { CALIBRATION_V3_ENABLED } from "@/lib/featureFlags";
import { createInterviewScorecard, getCalibrationSummary } from "@/lib/phase3/scorecards";
import { recordPhase3AuditEvent } from "@/lib/phase3/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("interviews.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!CALIBRATION_V3_ENABLED) return NextResponse.json({ enabled: false, calibration: [] });
  try {
    const calibration = await getCalibrationSummary();
    return NextResponse.json({ enabled: true, calibration, generated_at: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/interviews/scorecard", error);
    return NextResponse.json({ error: "Failed to load calibration summary" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("interviews.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!CALIBRATION_V3_ENABLED) return NextResponse.json({ enabled: false, scorecard: null });
  try {
    const body = await request.json();
    const applicationId = Number(body?.application_id);
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "application_id is required" }, { status: 400 });
    }
    const created = await createInterviewScorecard({
      applicationId,
      interviewerUserId: auth.access.user_id,
      roundLabel: typeof body?.round_label === "string" ? body.round_label.trim() : null,
      scorecard: body?.scorecard && typeof body.scorecard === "object" ? body.scorecard : {},
      overallRecommendation:
        typeof body?.overall_recommendation === "string" ? body.overall_recommendation.trim() : null,
    });
    await recordPhase3AuditEvent({
      actorUserId: auth.access.user_id,
      action: "phase3.scorecard.created",
      metadata: { application_id: applicationId, scorecard_id: created.id },
    });
    return NextResponse.json({ enabled: true, scorecard: created });
  } catch (error) {
    console.error("POST /api/interviews/scorecard", error);
    return NextResponse.json({ error: "Failed to save scorecard" }, { status: 500 });
  }
}
