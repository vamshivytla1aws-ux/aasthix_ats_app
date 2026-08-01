import { pool, query } from "@/lib/db";
import { evaluateAnswer, generateFinalEvaluation } from "@/lib/aiInterviews/provider";
import { enforceRecordingRetention, removeAnswerAudio } from "@/lib/aiInterviews/storage";
import { shouldTranscribeAnswer, transcribeAnswerAudio } from "@/lib/aiInterviews/transcription";
import { aiInterviewConfig } from "@/lib/aiInterviews/config";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";
import { buildPublicUrl } from "@/lib/publicUrl";

function integrityRisk(counts: Record<string, number>) {
  const high = (counts.MULTIPLE_FACES||0)+(counts.CAMERA_DISABLED||0)+(counts.MICROPHONE_DISABLED||0);
  const review = (counts.TAB_HIDDEN||0)+(counts.FULLSCREEN_EXIT||0)+(counts.FACE_NOT_VISIBLE||0)+(counts.LOOKING_AWAY||0);
  if (high>=2 || review>=8) return "HIGH";
  if (high>=1 || review>=3) return "REVIEW_RECOMMENDED";
  return "LOW";
}

export async function processAiInterview(interviewId: number) {
  const lock = await query(
    `UPDATE ai_interviews SET evaluation_status='PROCESSING',transcription_status='PROCESSING',processing_error=NULL,updated_at=NOW()
      WHERE id=$1 AND status IN ('PROCESSING','FAILED') AND evaluation_status IN ('PENDING','RETRYING','FAILED') RETURNING *`,
    [interviewId]
  );
  if (!lock.rowCount) return { skipped:true };
  try {
    const interview = lock.rows[0];
    const answers = await query(
      `SELECT q.id AS question_id,q.question_text,q.expected_points_json,q.max_score,q.order_number,
              a.id AS answer_id,COALESCE(a.transcript,'') AS transcript,a.answer_audio_path,a.answer_audio_mime_type,
              a.score,a.strengths_json,a.missing_points_json,a.evaluator_feedback,a.adaptive_analysis_json,a.evaluation_model
         FROM ai_interview_questions q LEFT JOIN ai_interview_answers a ON a.question_id=q.id
        WHERE q.interview_id=$1 ORDER BY q.order_number`, [interviewId]
    );
    const evaluated: Array<Record<string,unknown>> = [];
    for (const row of answers.rows) {
      const maxScore=Number(row.max_score||10);
      let transcript=String(row.transcript||"");
      let transcriptionModel=transcript.trim()?"browser_or_typed":"none";
      let transcriptStatus="COMPLETED";
      if(shouldTranscribeAnswer(transcript,Boolean(row.answer_audio_path))){
        try{const transcribed=await transcribeAnswerAudio(String(row.answer_audio_path),String(row.answer_audio_mime_type||"audio/webm"));transcript=transcribed.text;transcriptionModel=transcribed.model;}
        catch(error){transcriptStatus=transcript.trim()?"COMPLETED":"FAILED";console.error("[ai-interviews] answer transcription failed",error);}
      }
      const hasAdaptiveEvaluation=interview.interview_mode==="ADAPTIVE"&&row.adaptive_analysis_json&&Object.keys(row.adaptive_analysis_json).length>0;
      const result=hasAdaptiveEvaluation
        ? {score:Number(row.score||0),strengths:Array.isArray(row.strengths_json)?row.strengths_json.map(String):[],missingPoints:Array.isArray(row.missing_points_json)?row.missing_points_json.map(String):[],feedback:String(row.evaluator_feedback||row.adaptive_analysis_json.answerSummary||""),model:String(row.evaluation_model||"adaptive_luna")}
        : await evaluateAnswer({ question:String(row.question_text),expectedPoints:Array.isArray(row.expected_points_json)?row.expected_points_json.map(String):[],maxScore,transcript });
      if (row.answer_id) {
        await query(`UPDATE ai_interview_answers SET transcript=$2,score=$3,strengths_json=$4::jsonb,missing_points_json=$5::jsonb,
          evaluator_feedback=$6,transcript_status=$7,transcription_model=$8,evaluation_model=$9,
          answer_audio_path=NULL,answer_audio_size=NULL,updated_at=NOW() WHERE id=$1`,
          [row.answer_id,transcript,result.score,JSON.stringify(result.strengths),JSON.stringify(result.missingPoints),result.feedback,transcriptStatus,transcriptionModel,result.model]);
      }
      if(row.answer_audio_path)await removeAnswerAudio(String(row.answer_audio_path)).catch(error=>console.error("[ai-interviews] answer audio cleanup failed",error));
      evaluated.push({ question:row.question_text,transcript,score:result.score,max_score:maxScore,percentage:maxScore?Math.round(result.score/maxScore*100):0,strengths:result.strengths,missing_points:result.missingPoints });
    }
    const job = await query(`SELECT j.title FROM ai_interviews ai JOIN jobs j ON j.id=ai.job_id WHERE ai.id=$1`, [interviewId]);
    const final=await generateFinalEvaluation({ title:String(job.rows[0]?.title||"Role"),answers:evaluated });
    const eventRows=await query(`SELECT event_type,COUNT(*)::int AS count FROM ai_interview_events WHERE interview_id=$1 GROUP BY event_type`, [interviewId]);
    const counts=Object.fromEntries(eventRows.rows.map((row:{event_type:string;count:number})=>[row.event_type,Number(row.count)]));
    const risk=integrityRisk(counts);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ai_interview_evaluations (interview_id,evaluation_version,model_provider,model_name,technical_score,communication_score,experience_relevance_score,overall_score,strengths_json,concerns_json,summary,recommendation)
         VALUES ($1,'v1','openai',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
        [interviewId,final.model,final.technicalScore,final.communicationScore,final.experienceRelevanceScore,final.overallScore,JSON.stringify(final.strengths),JSON.stringify(final.concerns),final.summary,final.recommendation]
      );
      await client.query(
        `UPDATE ai_interviews SET status='COMPLETED',completed_at=COALESCE(completed_at,NOW()),technical_score=$2,communication_score=$3,
           experience_relevance_score=$4,overall_score=$5,ai_recommendation=$6,integrity_risk=$7,
           transcription_status='COMPLETED',evaluation_status='COMPLETED',evaluation_model=$8,transcription_model=$9,
           fallback_review_used=$10,updated_at=NOW() WHERE id=$1`,
        [interviewId,final.technicalScore,final.communicationScore,final.experienceRelevanceScore,final.overallScore,final.recommendation,risk,final.model,
          aiInterviewConfig.transcriptionModel,Boolean(final.fallbackReviewUsed)]
      );
      await client.query(`INSERT INTO ai_interview_audit_events (interview_id,event_type,metadata_json) VALUES ($1,'PROCESSING_COMPLETED',$2::jsonb)`, [interviewId,JSON.stringify({ integrity_risk:risk })]);
      await client.query("COMMIT");
    } catch(error){ await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await enforceRecordingRetention();
    const recipient=await query(`SELECT u.email,u.full_name,c.full_name AS candidate_name,j.title AS job_title FROM ai_interviews ai JOIN users u ON u.id=ai.created_by_user_id JOIN candidates c ON c.id=ai.candidate_id JOIN jobs j ON j.id=ai.job_id WHERE ai.id=$1`,[interviewId]);
    if(recipient.rowCount){const row=recipient.rows[0];await sendTransactionalEmail({to:[String(row.email)],subject:`AI interview report ready - ${String(row.candidate_name)}`,text:`Hello ${String(row.full_name)},\n\nThe AI interview report for ${String(row.candidate_name)} (${String(row.job_title)}) is ready for human review.\n\n${buildPublicUrl(`/ai-interviews/${interviewId}/report`)}`}).catch(()=>({sent:false as const,reason:"send_failed" as const}));}
    return { completed:true };
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    await query(`UPDATE ai_interviews SET status='FAILED',evaluation_status='FAILED',transcription_status='FAILED',processing_error=$2,updated_at=NOW() WHERE id=$1`, [interviewId,message.slice(0,2000)]);
    throw error;
  }
}
