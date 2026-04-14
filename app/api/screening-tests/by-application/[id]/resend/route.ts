import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { createAndSendScreeningTest } from "@/lib/screeningWorkflow";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const applicationId = Number(params.id);
    if (!Number.isFinite(applicationId)) return NextResponse.json({ error: "Invalid application id" }, { status: 400 });

    const own = await query(
      `
      SELECT id
      FROM applications
      WHERE id = $1
        AND created_by_user_id = $2
      LIMIT 1
      `,
      [applicationId, user.user_id]
    );
    if (own.rowCount === 0) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const origin = new URL(request.url).origin;
    const created = await createAndSendScreeningTest({
      applicationId,
      userId: Number(user.user_id),
      origin,
      reason: "manual_resend",
      sendEmail: true,
    });

    return NextResponse.json({ ok: true, ...created });
  } catch (error) {
    console.error("Error resending screening test by application", error);
    return NextResponse.json({ error: "Failed to resend screening test" }, { status: 500 });
  }
}
