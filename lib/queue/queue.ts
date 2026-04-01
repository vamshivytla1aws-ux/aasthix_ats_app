import { Queue } from "bullmq";
import { getBullConnection } from "@/lib/queue/connection";
import { aiMatchingConfig } from "@/lib/config/aiMatching";

export const AI_MATCH_QUEUE_NAME = "skill-profile-extract";

let queueSingleton: Queue | null = null;
let queueInitWarned = false;

/**
 * Returns null if Redis is unavailable (sync extract still works).
 */
export function getAiMatchQueue(): Queue | null {
  const connection = getBullConnection();
  if (!connection) {
    if (!queueInitWarned) {
      console.warn("[queue] BullMQ disabled — Redis connection not available");
      queueInitWarned = true;
    }
    return null;
  }
  if (!queueSingleton) {
    try {
      queueSingleton = new Queue(AI_MATCH_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: aiMatchingConfig.bullmqAttempts,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 200 },
        },
        limiter: {
          max: aiMatchingConfig.rateLimitMax,
          duration: aiMatchingConfig.rateLimitDurationMs,
        },
      } as ConstructorParameters<typeof Queue>[1]);
    } catch (e) {
      console.warn("[queue] Queue create failed:", String(e));
      return null;
    }
  }
  return queueSingleton;
}
