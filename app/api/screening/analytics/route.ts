import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const userId = auth.access.user_id;

    const summaryRes = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE st.status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE st.status = 'expired')::int AS expired,
        COUNT(*) FILTER (WHERE st.status = 'submitted')::int AS submitted,
        COUNT(*)::int AS total_tests
      FROM screening_tests st
      JOIN applications a ON a.id = st.application_id
      WHERE a.created_by_user_id = $1
      `,
      [userId]
    );

    const passRes = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE st.status = 'submitted' AND st.score >= 70)::int AS passed,
        COUNT(*) FILTER (WHERE st.status = 'submitted' AND st.score < 70)::int AS below_threshold,
        AVG(st.score) FILTER (WHERE st.status = 'submitted')::float AS avg_score_all
      FROM screening_tests st
      JOIN applications a ON a.id = st.application_id
      WHERE a.created_by_user_id = $1
      `,
      [userId]
    );

    const timeRes = await query(
      `
      SELECT
        AVG(EXTRACT(EPOCH FROM (st.submitted_at - st.created_at)))::float AS avg_seconds_to_submit
      FROM screening_tests st
      JOIN applications a ON a.id = st.application_id
      WHERE a.created_by_user_id = $1
        AND st.status = 'submitted'
        AND st.submitted_at IS NOT NULL
      `,
      [userId]
    );

    const resendRes = await query(
      `
      SELECT COUNT(*)::int AS resend_count
      FROM screening_audit_events e
      JOIN applications a ON a.id = e.application_id
      WHERE a.created_by_user_id = $1
        AND e.event_type = 'test_resent'
      `,
      [userId]
    );

    const byJobRes = await query(
      `
      SELECT
        j.id AS job_id,
        j.title AS job_title,
        COUNT(*)::int AS tests_count,
        COUNT(*) FILTER (WHERE st.status = 'submitted')::int AS submitted,
        COUNT(*) FILTER (WHERE st.status = 'submitted' AND st.score >= 70)::int AS passed,
        AVG(st.score) FILTER (WHERE st.status = 'submitted')::float AS avg_score
      FROM screening_tests st
      JOIN applications a ON a.id = st.application_id
      JOIN jobs j ON j.id = st.job_id
      WHERE a.created_by_user_id = $1
      GROUP BY j.id, j.title
      ORDER BY tests_count DESC, j.title ASC
      LIMIT 50
      `,
      [userId]
    );

    const queueRes = await query(
      `
      SELECT
        st.id AS test_id,
        st.expires_at,
        a.id AS application_id,
        c.full_name AS candidate_name,
        j.title AS job_title
      FROM screening_tests st
      JOIN applications a ON a.id = st.application_id
      JOIN candidates c ON c.id = st.candidate_id
      JOIN jobs j ON j.id = st.job_id
      WHERE a.created_by_user_id = $1
        AND st.status = 'pending'
      ORDER BY st.expires_at ASC
      LIMIT 100
      `,
      [userId]
    );

    const s = summaryRes.rows[0] || {};
    const p = passRes.rows[0] || {};
    const submitted = Number(p.below_threshold || 0) + Number(p.passed || 0);
    const passRate =
      submitted > 0 ? Math.round((Number(p.passed || 0) / submitted) * 1000) / 10 : null;

    return NextResponse.json({
      summary: {
        pending: Number(s.pending || 0),
        expired: Number(s.expired || 0),
        submitted: Number(s.submitted || 0),
        total_tests: Number(s.total_tests || 0),
        pass_rate_percent: passRate,
        avg_score_submitted: p.avg_score_all == null ? null : Math.round(Number(p.avg_score_all) * 10) / 10,
        avg_seconds_to_submit: timeRes.rows[0]?.avg_seconds_to_submit == null
          ? null
          : Math.round(Number(timeRes.rows[0].avg_seconds_to_submit)),
        resend_count: Number(resendRes.rows[0]?.resend_count || 0),
      },
      by_job: byJobRes.rows.map((r: any) => ({
        job_id: Number(r.job_id),
        job_title: String(r.job_title || ""),
        tests_count: Number(r.tests_count || 0),
        submitted: Number(r.submitted || 0),
        passed: Number(r.passed || 0),
        pass_rate_percent:
          Number(r.submitted || 0) > 0
            ? Math.round((Number(r.passed || 0) / Number(r.submitted)) * 1000) / 10
            : null,
        avg_score:
          r.avg_score == null ? null : Math.round(Number(r.avg_score) * 10) / 10,
      })),
      pending_queue: queueRes.rows.map((r: any) => ({
        test_id: Number(r.test_id),
        application_id: Number(r.application_id),
        candidate_name: String(r.candidate_name || ""),
        job_title: String(r.job_title || ""),
        expires_at: String(r.expires_at),
      })),
    });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Screening tables not migrated yet" }, { status: 503 });
    }
    console.error("screening analytics", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
