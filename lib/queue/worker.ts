/**
 * Standalone BullMQ worker — run: npm run worker:ai-match
 * Uses Redis from REDIS_URL or redis://127.0.0.1:6379
 */
import "dotenv/config";
import { Worker } from "bullmq";
import { getBullConnection } from "@/lib/queue/connection";
import { AI_MATCH_QUEUE_NAME, getAiMatchQueue } from "@/lib/queue/queue";
import { aiMatchingConfig } from "@/lib/config/aiMatching";
import { runSkillProfileExtractCore } from "@/lib/matchJobs/runSkillProfileExtractCore";
import { query } from "@/lib/db";

const failureTimestamps: number[] = [];

function recordFailureEvent() {
  const now = Date.now();
  failureTimestamps.push(now);
  const windowMs = aiMatchingConfig.autoPauseWindowMs;
  while (failureTimestamps.length > 0 && now - failureTimestamps[0]! > windowMs) {
    failureTimestamps.shift();
  }
}

async function maybeAutoPauseQueue() {
  if (failureTimestamps.length < aiMatchingConfig.autoPauseFailureThreshold) return;
  const q = getAiMatchQueue();
  if (!q) return;
  console.warn(`[ai-match-worker] auto-pause ${aiMatchingConfig.autoPauseDurationMs}ms`);
  await q.pause();
  setTimeout(() => {
    q.resume().catch(() => {});
  }, aiMatchingConfig.autoPauseDurationMs);
}

const connection = getBullConnection();
if (!connection) {
  console.error("[ai-match-worker] Redis unavailable — start Redis (e.g. localhost:6379) or set REDIS_URL");
  process.exit(1);
}

const worker = new Worker(
  AI_MATCH_QUEUE_NAME,
  async (job) => {
    const { jobId, userId, runId } = job.data as {
      jobId: number;
      userId: number;
      runId: number;
    };
    const t0 = Date.now();
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        scope: "ai-match-worker",
        event: "job_start",
        bullmqJobId: job.id,
        jobId,
        runId,
      })
    );

    try {
      await query(
        `UPDATE ai_match_job_runs SET status = 'active', bullmq_job_id = $2, updated_at = NOW() WHERE id = $1`,
        [runId, String(job.id)]
      ).catch(() => {});

      await runSkillProfileExtractCore({
        jobId,
        userId,
        runId,
        bullmqJobId: job.id,
      });

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          scope: "ai-match-worker",
          event: "job_success",
          bullmqJobId: job.id,
          duration: Date.now() - t0,
        })
      );
      return { ok: true };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await query(
        `UPDATE ai_match_job_runs SET status = 'failed', last_error = $2, updated_at = NOW() WHERE id = $1`,
        [runId, err]
      ).catch(() => {});
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          scope: "ai-match-worker",
          event: "job_failure",
          error: err,
        })
      );
      throw e;
    }
  },
  {
    connection,
    concurrency: aiMatchingConfig.workerConcurrency,
  }
);

worker.on("failed", (job, err) => {
  recordFailureEvent();
  void maybeAutoPauseQueue();
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "ai-match-worker",
      event: "bullmq_failed",
      bullmqJobId: job?.id,
      error: String(err),
    })
  );
});

worker.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), scope: "ai-match-worker", error: String(err) }));
});

console.log(
  JSON.stringify({
    ts: new Date().toISOString(),
    scope: "ai-match-worker",
    event: "worker_listening",
    queue: AI_MATCH_QUEUE_NAME,
    concurrency: aiMatchingConfig.workerConcurrency,
  })
);
