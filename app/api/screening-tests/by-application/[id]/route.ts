import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const applicationId = Number(params.id);
    if (!Number.isFinite(applicationId)) return NextResponse.json({ error: "Invalid application id" }, { status: 400 });

    const result = await query(
      `
      SELECT
        st.id,
        st.status,
        st.expires_at,
        st.submitted_at,
        st.score,
        st.feedback,
        st.strengths,
        st.weaknesses,
        st.quality_flag,
        st.created_at
      FROM screening_tests st
      JOIN applications a ON a.id = st.application_id
      WHERE st.application_id = $1
        AND a.created_by_user_id = $2
      ORDER BY st.created_at DESC, st.id DESC
      LIMIT 1
      `,
      [applicationId, user.user_id]
    );

    return NextResponse.json({ test: result.rows[0] || null });
  } catch (error) {
    console.error("Error fetching screening test by application", error);
    return NextResponse.json({ error: "Failed to fetch screening test" }, { status: 500 });
  }
}
