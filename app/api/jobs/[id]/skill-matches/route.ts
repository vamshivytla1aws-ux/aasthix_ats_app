import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 25)));
    const minScore = Math.max(0, Math.min(100, Number(url.searchParams.get("min_score") || 0)));

    const profileRes = await query(
      `SELECT
         p.must_have_skills,
         p.nice_to_have_skills,
         p.role_keywords,
         p.extraction_mode,
         p.updated_at AS profile_updated_at
       FROM job_skill_profiles p
       WHERE p.job_id = $1`,
      [jobId]
    );

    let matchesRes;
    try {
      matchesRes = await query(
        `SELECT
           m.candidate_id,
           m.match_score,
           m.matched_skills,
           m.missing_must_have,
           m.match_breakdown,
           m.match_score_no_ai,
           m.hire_probability,
           m.decision_no_ai,
           m.no_ai_rank,
           m.ai_rerank_score,
           m.ai_rerank_decision,
           m.ai_rerank_reason,
           m.ai_rerank_rank,
           m.already_applied,
           m.application_stage,
           m.computed_at,
           c.full_name,
           c.email,
           c.skills,
           c.location,
           c.notice_period
         FROM candidate_job_matches m
         JOIN candidates c ON c.id = m.candidate_id
         WHERE m.job_id = $1 AND m.match_score >= $2
         ORDER BY
           m.ai_rerank_rank ASC NULLS LAST,
           m.no_ai_rank ASC NULLS LAST,
           m.match_score_no_ai DESC NULLS LAST,
           m.match_score DESC,
           c.full_name ASC
         LIMIT $3`,
        [jobId, minScore, limit]
      );
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
      if (code !== "42703") throw e;
      matchesRes = await query(
        `SELECT
           m.candidate_id,
           m.match_score,
           m.matched_skills,
           m.missing_must_have,
           m.match_breakdown,
           m.match_score_no_ai,
           m.hire_probability,
           m.decision_no_ai,
           m.already_applied,
           m.application_stage,
           m.computed_at,
           c.full_name,
           c.email,
           c.skills,
           c.location,
           c.notice_period
         FROM candidate_job_matches m
         JOIN candidates c ON c.id = m.candidate_id
         WHERE m.job_id = $1 AND m.match_score >= $2
         ORDER BY m.match_score_no_ai DESC NULLS LAST, m.match_score DESC, c.full_name ASC
         LIMIT $3`,
        [jobId, minScore, limit]
      );
    }

    return NextResponse.json({
      profile: profileRes.rows[0] ?? null,
      matches: matchesRes.rows,
    });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({ profile: null, matches: [], migration_required: true });
    }
    console.error("skill-matches", error);
    return NextResponse.json({ error: "Failed to load matches" }, { status: 500 });
  }
}
