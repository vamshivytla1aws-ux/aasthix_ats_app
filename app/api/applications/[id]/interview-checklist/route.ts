import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertApplicationAccess(appId: number, userId: number): Promise<{ job_id: number } | null> {
  const hasTeam = await hasJobTeamTable();
  const pred = applicationAccessPredicate("a", "$2", hasTeam);
  const appRes = await query(
    `SELECT a.id, a.job_id FROM applications a WHERE a.id = $1 AND (${pred}) LIMIT 1`,
    [appId, userId]
  );
  if (appRes.rowCount === 0) return null;
  return { job_id: Number(appRes.rows[0].job_id) };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const appId = Number(params.id);
    if (!Number.isFinite(appId)) return NextResponse.json({ error: "Invalid application id" }, { status: 400 });

    const access = await assertApplicationAccess(appId, user.user_id);
    if (!access) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    let rows;
    try {
      rows = await query(
        `SELECT
           q.id AS question_id,
           q.category,
           q.question,
           q.sort_order,
           COALESCE(f.asked, FALSE) AS asked,
           f.notes,
           f.rating
         FROM job_interview_questions q
         LEFT JOIN application_interview_question_feedback f
           ON f.question_id = q.id
          AND f.application_id = $1
         WHERE q.job_id = $2
         ORDER BY q.category, q.sort_order, q.id`,
        [appId, access.job_id]
      );
    } catch (e: any) {
      if (e?.code === "42703") {
        rows = await query(
          `SELECT
             q.id AS question_id,
             q.category,
             q.question,
             q.sort_order,
             COALESCE(f.asked, FALSE) AS asked,
             f.notes,
             NULL::smallint AS rating
           FROM job_interview_questions q
           LEFT JOIN application_interview_question_feedback f
             ON f.question_id = q.id
            AND f.application_id = $1
           WHERE q.job_id = $2
           ORDER BY q.category, q.sort_order, q.id`,
          [appId, access.job_id]
        );
      } else throw e;
    }

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

    const access = await assertApplicationAccess(appId, user.user_id);
    if (!access) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const body = await request.json();
    const items = Array.isArray(body?.checklist) ? body.checklist : [];

    for (const item of items) {
      const questionId = Number(item?.question_id);
      if (!Number.isFinite(questionId)) continue;
      const asked = Boolean(item?.asked);
      const notes = String(item?.notes || "").trim() || null;
      let rating: number | null = null;
      if (item?.rating != null && item.rating !== "") {
        const n = Number(item.rating);
        if (Number.isFinite(n) && n >= 1 && n <= 5) rating = Math.round(n);
      }
      try {
        await query(
          `INSERT INTO application_interview_question_feedback (application_id, question_id, asked, notes, rating, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (application_id, question_id)
           DO UPDATE SET
             asked = EXCLUDED.asked,
             notes = EXCLUDED.notes,
             rating = COALESCE(EXCLUDED.rating, application_interview_question_feedback.rating),
             updated_at = NOW()`,
          [appId, questionId, asked, notes, rating]
        );
      } catch (e: any) {
        if (e?.code === "42703") {
          await query(
            `INSERT INTO application_interview_question_feedback (application_id, question_id, asked, notes, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (application_id, question_id)
             DO UPDATE SET asked = EXCLUDED.asked, notes = EXCLUDED.notes, updated_at = NOW()`,
            [appId, questionId, asked, notes]
          );
        } else throw e;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Run latest migrations to enable interview checklist" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save checklist" }, { status: 500 });
  }
}
