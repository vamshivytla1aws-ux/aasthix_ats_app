import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";

const STAGES = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"] as const;

/** GET: candidates for this job ordered for shortlist (AI rerank > No-AI rank > score). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    let res;
    try {
      res = await query(
        `
        SELECT
          m.candidate_id,
          m.match_score_no_ai,
          m.no_ai_rank,
          m.ai_rerank_rank,
          m.ai_rerank_score,
          m.ai_rerank_decision,
          m.ai_rerank_reason
        FROM candidate_job_matches m
        WHERE m.job_id = $1
        ORDER BY
          m.ai_rerank_rank ASC NULLS LAST,
          m.no_ai_rank ASC NULLS LAST,
          m.match_score_no_ai DESC NULLS LAST
        LIMIT 200
        `,
        [jobId]
      );
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
      if (code !== "42703") throw e;
      res = await query(
        `
        SELECT
          m.candidate_id,
          m.match_score_no_ai,
          NULL::int AS no_ai_rank,
          NULL::int AS ai_rerank_rank,
          NULL::int AS ai_rerank_score,
          NULL::text AS ai_rerank_decision,
          NULL::text AS ai_rerank_reason
        FROM candidate_job_matches m
        WHERE m.job_id = $1
        ORDER BY m.match_score_no_ai DESC NULLS LAST
        LIMIT 200
        `,
        [jobId]
      );
    }

    return NextResponse.json({ job_id: jobId, candidates: res.rows });
  } catch (error) {
    console.error("shortlist GET", error);
    return NextResponse.json({ error: "Failed to load shortlist order" }, { status: 500 });
  }
}

type Stage = (typeof STAGES)[number];

function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const jobOk = await query(
      `SELECT 1 FROM jobs WHERE id = $1 AND created_by_user_id = $2 LIMIT 1`,
      [jobId, user.user_id]
    );
    if (jobOk.rowCount === 0) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const body = await request.json();
    const ids = Array.isArray(body?.candidate_ids) ? body.candidate_ids.map((x: unknown) => Number(x)).filter(Number.isFinite) : [];
    const stage: Stage = isStage(body?.stage) ? body.stage : "Screening";

    if (ids.length === 0) return NextResponse.json({ error: "candidate_ids required" }, { status: 400 });
    if (ids.length > 50) return NextResponse.json({ error: "Max 50 candidates per request" }, { status: 400 });

    let created = 0;
    for (const cid of ids) {
      const own = await query(
        `SELECT 1 FROM candidates WHERE id = $1 AND created_by_user_id = $2`,
        [cid, user.user_id]
      );
      if (own.rowCount === 0) continue;

      await query(
        `INSERT INTO applications (
           candidate_id,
           job_id,
           stage,
           status,
           updated_at,
           created_by_user_id,
           current_interview_round_id,
           current_interview_round_order,
           interview_round_status
         )
         VALUES (
           $1,
           $2,
           $3,
           $3,
           NOW(),
           $4,
           NULL,
           NULL,
           CASE WHEN $3 = 'Interview' THEN NULL ELSE 'not_started' END
         )
         ON CONFLICT (candidate_id, job_id) DO UPDATE SET
           stage = EXCLUDED.stage,
           status = EXCLUDED.stage,
           updated_at = NOW(),
           current_interview_round_id = CASE WHEN EXCLUDED.stage = 'Interview' THEN applications.current_interview_round_id ELSE NULL END,
           current_interview_round_order = CASE WHEN EXCLUDED.stage = 'Interview' THEN applications.current_interview_round_order ELSE NULL END,
           interview_round_status = CASE WHEN EXCLUDED.stage = 'Interview' THEN applications.interview_round_status ELSE 'not_started' END`,
        [cid, jobId, stage, user.user_id]
      );
      created += 1;

      try {
        await query(
          `UPDATE candidate_job_matches
           SET already_applied = TRUE, application_stage = $3, computed_at = NOW()
           WHERE job_id = $1 AND candidate_id = $2`,
          [jobId, cid, stage]
        );
      } catch {
        /* optional table */
      }
    }

    return NextResponse.json({ ok: true, shortlisted: created, stage });
  } catch (error) {
    console.error("shortlist", error);
    return NextResponse.json({ error: "Failed to shortlist" }, { status: 500 });
  }
}
