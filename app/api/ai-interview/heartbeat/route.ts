import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";

export const runtime="nodejs";
export async function POST(){
  const interview=await requireCandidateInterview();
  if(!interview)return NextResponse.json({error:"Interview session is invalid"},{status:401});
  await query(`UPDATE ai_interviews SET last_heartbeat_at=NOW() WHERE id=$1 AND status='IN_PROGRESS'`,[interview.id]);
  return NextResponse.json({ok:true,server_time:new Date().toISOString()});
}
