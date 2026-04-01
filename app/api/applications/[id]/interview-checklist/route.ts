import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const appId = Number(params.id);
    if (!Number.isFinite(appId)) return NextResponse.json({ error: "Invalid application id" }, { status: 400 });

    const appRes = await query(
      `SELECT a.id, a.job_id
       FROM applications a
       WHERE a.id = $1 AND a.created_by_user_id = $2
       LIMIT 1`,
      [appId, user.user_id]
    );
    if (appRes.rowCount === 0) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const jobId = Number(appRes.rows[0].job_id);
    const rows = await query(
      `SELECT
         q.id AS question_id,
         q.category,
         q.question,
         q.sort_order,
         COALESCE(f.asked, FALSE) AS asked,
         f.notes
       FROM job_interview_questions q
       LEFT JOIN application_interview_question_feedback f
         ON f.question_id = q.id
        AND f.application_id = $1
       WHERE q.job_id = $2
       ORDER BY q.category, q.sort_order, q.id`,
      [appId, jobId]
    );

    return NextResponse.json({ checklist: rows.rows });
  } catch (error: any) {
    if (error?.code === "42P01") return NextResponse.json({ checklist: [] });
    return NextResponse.json({ error: "Failed to fetch checklist" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const appId = Number(params.id);
    if (!Number.isFinite(appId)) return NextResponse.json({ error: "Invalid application id" }, { status: 400 });

    const appRes = await query(
      `SELECT a.id
       FROM applications a
       WHERE a.id = $1 AND a.created_by_user_id = $2
       LIMIT 1`,
      [appId, user.user_id]
    );
    if (appRes.rowCount === 0) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const body = await request.json();
    const items = Array.isArray(body?.checklist) ? body.checklist : [];

    for (const item of items) {
      const questionId = Number(item?.question_id);
      if (!Number.isFinite(questionId)) continue;
      const asked = Boolean(item?.asked);
      const notes = String(item?.notes || "").trim() || null;
      await query(
        `INSERT INTO application_interview_question_feedback (application_id, question_id, asked, notes, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (application_id, question_id)
         DO UPDATE SET asked = EXCLUDED.asked, notes = EXCLUDED.notes, updated_at = NOW()`,
        [appId, questionId, asked, notes]
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Run latest migrations to enable interview checklist" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save checklist" }, { status: 500 });
  }
}
