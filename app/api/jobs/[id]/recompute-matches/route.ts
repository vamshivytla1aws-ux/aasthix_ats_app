import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { runHybridJobMatch } from "@/lib/enhancedHybridMatching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

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

    return NextResponse.json({
      success: true,
      message: "Hybrid match complete (No-AI bulk + optional top-10 AI rerank)",
      job_id: result.jobId,
      processed: result.noAi.processed,
      no_ai_meta: result.noAi.meta,
      ai_rerank: result.aiRerank,
      top_10: result.top10ForUi,
    });
  } catch (error: unknown) {
    const status = error && typeof error === "object" && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 500;
    const msg = error instanceof Error ? error.message : "Failed to recompute matches";
    console.error("recompute-matches", error);
    if (status >= 400 && status < 500) {
      return NextResponse.json({ error: msg }, { status });
    }
    return NextResponse.json({ error: "Failed to recompute matches" }, { status: 500 });
  }
}
