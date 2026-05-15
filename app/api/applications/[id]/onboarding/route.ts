import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getLatestPacketByApplication } from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("pipeline.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const applicationId = Number(params.id);
  if (!Number.isFinite(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const appRes = await query(
    `
    SELECT a.id, a.stage, a.candidate_id, a.job_id, c.full_name AS candidate_full_name, c.email AS candidate_email, j.title AS job_title
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [applicationId]
  );
  if (appRes.rowCount === 0) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  const latest = await getLatestPacketByApplication(applicationId);

  return NextResponse.json({
    application: appRes.rows[0],
    onboarding: latest,
  });
}
