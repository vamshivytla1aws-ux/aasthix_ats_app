import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { enqueueAiInterview } from "@/lib/aiInterviews/queue";
import { processAiInterview } from "@/lib/aiInterviews/processor";

export const runtime="nodejs";

export async function POST(request:Request){
  const interview=await requireCandidateInterview();
  if(!interview) return NextResponse.json({error:"Interview session is invalid"},{status:401});
  const body=await request.json().catch(()=>({}));
  const idempotencyKey=String(body?.idempotency_key||crypto.randomUUID());
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const result=await client.query(
      `UPDATE ai_interviews SET status='PROCESSING',completed_at=COALESCE(completed_at,NOW()),evaluation_status='PENDING',transcription_status='PENDING',updated_at=NOW()
        WHERE id=$1 AND status='IN_PROGRESS' RETURNING id,status`,[interview.id]
    );
    if(!result.rowCount){
      const existing=await client.query(`SELECT id,status FROM ai_interviews WHERE id=$1`,[interview.id]);
      await client.query("ROLLBACK");
      if(["PROCESSING","COMPLETED"].includes(existing.rows[0]?.status)) return NextResponse.json({submitted:true,status:existing.rows[0].status});
      return NextResponse.json({error:"Interview cannot be completed"},{status:409});
    }
    await client.query(
      `INSERT INTO ai_interview_events (interview_id,event_type,severity,occurred_at,deduplication_key)
       VALUES ($1,'INTERVIEW_COMPLETED','INFO',NOW(),$2) ON CONFLICT DO NOTHING`,[interview.id,`complete-${idempotencyKey}`]
    );
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  const queued=await enqueueAiInterview(Number(interview.id)).catch(()=>false);
  // Always start processing on the Railway web service. The optional BullMQ
  // worker is a durability backup; the processor's atomic claim prevents duplicates.
  setImmediate(()=>{void processAiInterview(Number(interview.id)).catch(error=>console.error("[ai-interviews] background processing",error));});
  return NextResponse.json({submitted:true,status:"PROCESSING",processing_mode:queued?"QUEUED":"BACKGROUND"},{status:202});
}
