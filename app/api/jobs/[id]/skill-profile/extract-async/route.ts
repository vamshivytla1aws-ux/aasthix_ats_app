import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAiMatchQueue } from "@/lib/queue/queue";
import { aiMatchingConfig } from "@/lib/config/aiMatching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — enqueue full job skill extract + AI scoring (BullMQ). Requires Redis (REDIS_URL or localhost) + worker.
 * Optional body: { priority?: number } — higher = sooner (e.g. shortlisted follow-ups).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const jobOk = await query(`SELECT 1 FROM jobs WHERE id = $1 AND created_by_user_id = $2 LIMIT 1`, [
      jobId,
      user.user_id,
    ]);
    if (jobOk.rowCount === 0) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const q = getAiMatchQueue();
    if (!q) {
      return NextResponse.json(
        { error: "Redis queue unavailable — start Redis (localhost:6379 or REDIS_URL) and run npm run worker:ai-match" },
        { status: 503 }
      );
    }

    const candCount = await query(`SELECT COUNT(*)::text AS c FROM candidates WHERE created_by_user_id = $1`, [
      user.user_id,
    ]);
    const total = Number((candCount.rows[0] as { c: string }).c) || 0;

    const body = (await request.json().catch(() => ({}))) as { priority?: number };
    const priority = Math.max(1, Math.min(1_000_000, Number(body?.priority) || 1));

    const ins = await query(
      `INSERT INTO ai_match_job_runs (job_id, created_by_user_id, status, total_candidates)
       VALUES ($1, $2, 'queued', $3)
       RETURNING id`,
      [jobId, user.user_id, total]
    );
    const runId = (ins.rows[0] as { id: number }).id;

    const bullJob = await q.add(
      "skill-profile-extract",
      { jobId, userId: user.user_id, runId },
      {
        priority,
        attempts: aiMatchingConfig.bullmqAttempts,
      }
    );

    await query(`UPDATE ai_match_job_runs SET bullmq_job_id = $2 WHERE id = $1`, [runId, String(bullJob.id)]).catch(
      () => {}
    );

    return NextResponse.json({
      ok: true,
      runId,
      bullmqJobId: bullJob.id,
      total_candidates: total,
      priority,
    });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "42P01") {
      return NextResponse.json({ error: "Run migration 0046_ai_match_job_runs.sql" }, { status: 400 });
    }
    console.error("extract-async", e);
    return NextResponse.json({ error: "Failed to enqueue extract job" }, { status: 500 });
  }
}

/**
 * GET ?runId= — progress for a run (polling).
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    const url = new URL(request.url);
    const runId = Number(url.searchParams.get("runId"));
    if (!Number.isFinite(jobId) || !Number.isFinite(runId)) {
      return NextResponse.json({ error: "Invalid job id or runId" }, { status: 400 });
    }

    const res = await query(
      `SELECT id, status, total_candidates, completed_count, failed_count, last_error, bullmq_job_id, created_at, updated_at,
              embedding_preview_json
       FROM ai_match_job_runs
       WHERE id = $1 AND job_id = $2 AND created_by_user_id = $3
       LIMIT 1`,
      [runId, jobId, user.user_id]
    );
    if (res.rowCount === 0) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const row = res.rows[0] as {
      status: string;
      total_candidates: number;
      completed_count: number;
      failed_count: number;
      last_error: string | null;
      bullmq_job_id: string | null;
      embedding_preview_json?: unknown | null;
    };

    const total = Math.max(0, row.total_candidates);
    const done = Math.max(0, row.completed_count);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return NextResponse.json({
      runId,
      status: row.status,
      total_candidates: total,
      completed_count: done,
      failed_count: row.failed_count,
      progress_percent: pct,
      last_error: row.last_error,
      bullmq_job_id: row.bullmq_job_id,
      embedding_preview: row.embedding_preview_json ?? null,
    });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "42P01") {
      return NextResponse.json({ error: "Run migration 0046_ai_match_job_runs.sql" }, { status: 400 });
    }
    console.error("extract-async GET", e);
    return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
  }
}
