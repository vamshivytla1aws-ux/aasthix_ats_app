import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregate skill-gap signals from stored matches (enterprise reporting).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const gapRes = await query(
      `SELECT missing_must_have
       FROM candidate_job_matches m
       JOIN jobs j ON j.id = m.job_id
       WHERE m.job_id = $1
         AND j.created_by_user_id = $2
         AND m.match_score < 60
         AND m.missing_must_have IS NOT NULL
         AND TRIM(m.missing_must_have) <> ''
       LIMIT 80`,
      [jobId, user.user_id]
    );

    const freq = new Map<string, number>();
    for (const row of gapRes.rows as { missing_must_have: string }[]) {
      for (const part of (row.missing_must_have || "").split(",")) {
        const s = part.trim().toLowerCase();
        if (s.length < 2) continue;
        freq.set(s, (freq.get(s) || 0) + 1);
      }
    }
    const top_gaps = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

    const dist = await query(
      `SELECT
         COUNT(*) FILTER (WHERE m.match_score >= 80)::int AS high,
         COUNT(*) FILTER (WHERE m.match_score >= 50 AND m.match_score < 80)::int AS medium,
         COUNT(*) FILTER (WHERE m.match_score < 50)::int AS low,
         COUNT(*)::int AS total
       FROM candidate_job_matches m
       JOIN jobs j ON j.id = m.job_id
       WHERE m.job_id = $1 AND j.created_by_user_id = $2`,
      [jobId, user.user_id]
    );

    return NextResponse.json({
      top_missing_skills_among_weak_matches: top_gaps,
      match_distribution: dist.rows[0] ?? { high: 0, medium: 0, low: 0, total: 0 },
    });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({
        top_missing_skills_among_weak_matches: [],
        match_distribution: { high: 0, medium: 0, low: 0, total: 0 },
        migration_required: true,
      });
    }
    return NextResponse.json({ error: "Failed to load insights" }, { status: 500 });
  }
}
