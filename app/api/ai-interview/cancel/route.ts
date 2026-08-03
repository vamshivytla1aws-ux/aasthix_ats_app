import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview)
    return NextResponse.json(
      { error: "Interview session is invalid" },
      { status: 401 },
    );

  const body = await request.json().catch(() => ({}));
  const reason = String(body?.reason || "candidate_cancelled").slice(0, 200);
  const idempotencyKey = String(body?.idempotency_key || crypto.randomUUID());

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Only cancel if currently in a cancellable state.
    const result = await client.query(
      `UPDATE ai_interviews
          SET status = 'CANCELLED',
              token_revoked_at = COALESCE(token_revoked_at, NOW()),
              completed_at = COALESCE(completed_at, NOW()),
              updated_at = NOW()
        WHERE id = $1
          AND status IN ('READY', 'IN_PROGRESS')
        RETURNING id, status`,
      [interview.id],
    );

    if (!result.rowCount) {
      const existing = await client.query(
        `SELECT id, status FROM ai_interviews WHERE id = $1`,
        [interview.id],
      );
      await client.query("ROLLBACK");
      const currentStatus = existing.rows[0]?.status;
      if (["CANCELLED", "COMPLETED", "PROCESSING"].includes(currentStatus)) {
        return NextResponse.json({ cancelled: true, status: currentStatus });
      }
      return NextResponse.json(
        { error: "Interview cannot be cancelled in its current state" },
        { status: 409 },
      );
    }

    // Record audit event.
    await client.query(
      `INSERT INTO ai_interview_events (interview_id, event_type, severity, occurred_at, deduplication_key, metadata_json)
       VALUES ($1, 'INTERVIEW_CANCELLED', 'INFO', NOW(), $2, $3::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        interview.id,
        `cancel-${idempotencyKey}`,
        JSON.stringify({ reason, cancelled_by: "candidate" }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return NextResponse.json({ cancelled: true, status: "CANCELLED" });
}
