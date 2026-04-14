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

    const testId = Number(params.id);
    if (!Number.isFinite(testId)) return NextResponse.json({ error: "Invalid test id" }, { status: 400 });

    const origin = new URL(request.url).origin;

    // This route uses screening-test id, but workflow function accepts application id.
    // We read current test to resolve application and then create a fresh token + new test row.
    const currentRes = await query(
      `
      SELECT application_id
      FROM screening_tests
      WHERE id = $1
      LIMIT 1
      `,
      [testId]
    );
    if (currentRes.rowCount === 0) return NextResponse.json({ error: "Screening test not found" }, { status: 404 });

    const applicationId = Number(currentRes.rows[0].application_id);
    const created = await createAndSendScreeningTest({
      applicationId,
      userId: Number(user.user_id),
      origin,
      reason: "manual_resend",
      sendEmail: true,
    });

    return NextResponse.json({ ok: true, ...created });
  } catch (error) {
    console.error("Error resending screening test", error);
    return NextResponse.json({ error: "Failed to resend screening test" }, { status: 500 });
  }
}
