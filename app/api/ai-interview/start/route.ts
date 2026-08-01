import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";

export async function POST() {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const consent = await client.query(`SELECT 1 FROM ai_interview_consents WHERE interview_id=$1`, [interview.id]);
    if (!consent.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Consent is required before starting" }, { status: 409 }); }
    const systemCheck = await client.query(`SELECT 1 FROM ai_interview_events WHERE interview_id=$1 AND event_type='SYSTEM_CHECK_PASSED' LIMIT 1`, [interview.id]);
    if (!systemCheck.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Complete the required system check before starting" }, { status: 409 }); }
    const result = await client.query(
      `UPDATE ai_interviews SET status='IN_PROGRESS',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
        WHERE id=$1 AND status IN ('READY','SCHEDULED','IN_PROGRESS') RETURNING id,status,started_at`, [interview.id]
    );
    if (!result.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Interview cannot be started" }, { status: 409 }); }
    await client.query(
      `INSERT INTO ai_interview_events (interview_id,event_type,severity,occurred_at,deduplication_key)
       VALUES ($1,'INTERVIEW_STARTED','INFO',NOW(),$2) ON CONFLICT DO NOTHING`,
      [interview.id,`start-${interview.id}`]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ...result.rows[0], upload_id: crypto.randomUUID() });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
