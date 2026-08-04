import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) {
    return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = String(body?.reason || "USER_EXIT").substring(0, 50);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const result = await client.query(
      `UPDATE ai_interviews 
       SET status = 'CANCELLED', evaluation_status = 'CANCELLED', cancellation_reason = $1, token_revoked_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status IN ('DRAFT', 'SCHEDULED', 'READY', 'IN_PROGRESS')
       RETURNING id, status`,
      [reason, interview.id]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Interview cannot be cancelled from its current state" },
        { status: 409 }
      );
    }

    await client.query(
      `INSERT INTO ai_interview_events (interview_id, event_type, severity, occurred_at, metadata)
       VALUES ($1, 'INTERVIEW_CANCELLED', 'WARNING', NOW(), $2) ON CONFLICT DO NOTHING`,
      [interview.id, JSON.stringify({ reason })]
    );

    await client.query("COMMIT");
    return NextResponse.json({ cancelled: true, reason });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[ai-interview/cancel] Error:", error);
    return NextResponse.json({ error: "Failed to cancel interview" }, { status: 500 });
  } finally {
    client.release();
  }
}
