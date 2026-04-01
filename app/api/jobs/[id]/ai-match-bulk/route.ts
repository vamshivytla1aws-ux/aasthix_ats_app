import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { runHybridJobMatch } from "@/lib/enhancedHybridMatching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/jobs/:id/ai-match-bulk
 * Production path: same hybrid orchestrator as `recompute-matches` (No-AI bulk + one AI call for top 10).
 * Request body is ignored for ranking; kept for API compatibility.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const jobOk = await query(
      `SELECT id FROM jobs WHERE id = $1 AND created_by_user_id = $2 LIMIT 1`,
      [jobId, user.user_id]
    );
    if (jobOk.rowCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const result = await runHybridJobMatch(jobId, user.user_id);

    const ranked = result.top10ForUi.map((r) => ({
      id: String(r.candidate_id),
      candidate_id: r.candidate_id,
      match_score: r.ai_rerank_score ?? r.match_score_no_ai ?? 0,
      match_score_no_ai: r.match_score_no_ai,
      no_ai_rank: r.no_ai_rank,
      ai_rerank_rank: r.ai_rerank_rank,
      ai_rerank_score: r.ai_rerank_score,
      ai_rerank_decision: r.ai_rerank_decision,
      ai_rerank_reason: r.ai_rerank_reason,
      decision: result.aiRerank.ok ? undefined : "No-AI only",
    }));

    return NextResponse.json({
      job_id: jobId,
      total: ranked.length,
      hybrid: true,
      no_ai: result.noAi,
      ai_rerank: result.aiRerank,
      top_candidates: ranked,
      all: ranked,
      all_candidates: ranked,
      shortlisted: ranked.filter((x) => (x.ai_rerank_score ?? x.match_score_no_ai ?? 0) >= 50),
    });
  } catch (e) {
    console.error("ai-match-bulk", e);
    return NextResponse.json({ error: "Matching failed" }, { status: 500 });
  }
}
