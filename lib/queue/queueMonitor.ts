import { getAiMatchQueue } from "@/lib/queue/queue";

export type QueueMonitorSnapshot = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  paused: number;
  delayed: number;
};

/**
 * BullMQ job counts for dashboards / GET /api/queue-status.
 */
export async function getQueueJobCounts(): Promise<QueueMonitorSnapshot | null> {
  const q = getAiMatchQueue();
  if (!q) return null;
  const c = await q.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "paused",
    "delayed"
  );
  return {
    waiting: c.waiting ?? 0,
    active: c.active ?? 0,
    completed: c.completed ?? 0,
    failed: c.failed ?? 0,
    paused: c.paused ?? 0,
    delayed: c.delayed ?? 0,
  };
}
