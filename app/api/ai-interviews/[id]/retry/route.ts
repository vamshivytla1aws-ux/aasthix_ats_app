import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { enqueueAiInterview } from "@/lib/aiInterviews/queue";
import { processAiInterview } from "@/lib/aiInterviews/processor";

export const runtime="nodejs";
export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
 const id=Number((await context.params).id);const auth=await requirePermission("ai_interviews.review");
 if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 if(!(await canAccessAiInterview(auth.access,id)))return NextResponse.json({error:"Forbidden"},{status:403});
 const result=await query(`UPDATE ai_interviews SET status='PROCESSING',evaluation_status='RETRYING',transcription_status='RETRYING',processing_error=NULL,updated_at=NOW() WHERE id=$1 AND status='FAILED' RETURNING id`,[id]);
 if(!result.rowCount)return NextResponse.json({error:"Only failed processing can be retried"},{status:409});
 const queued=await enqueueAiInterview(id).catch(()=>false);if(!queued)setImmediate(()=>{void processAiInterview(id).catch(console.error);});
 return NextResponse.json({queued:true,mode:queued?"QUEUED":"BACKGROUND"},{status:202});
}
