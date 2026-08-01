import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireAiInterviewEnabled, aiInterviewConfig } from "@/lib/aiInterviews/config";
import { createInterviewSchema } from "@/lib/aiInterviews/schemas";
import { createSecureInterviewToken, hashInterviewToken } from "@/lib/aiInterviews/token";
import { generateQuestions } from "@/lib/aiInterviews/provider";
import { buildPublicUrl } from "@/lib/publicUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "AI interview request failed" }, { status });
}

export async function GET(request: Request) {
  try {
    requireAiInterviewEnabled();
    const auth = await requirePermission("ai_interviews.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "").trim().toUpperCase();
    const search = String(url.searchParams.get("search") || "").trim();
    const params: unknown[] = auth.access.role === "admin" ? [] : [auth.access.user_id];
    const where = [auth.access.role === "admin" ? "TRUE" : `(
      ai.created_by_user_id=$1 OR j.created_by_user_id=$1 OR a.assigned_recruiter_user_id=$1 OR
      EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id=ai.job_id AND jt.user_id=$1)
    )`];
    if (status) { params.push(status); where.push(`ai.status=$${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(c.full_name ILIKE $${params.length} OR j.title ILIKE $${params.length} OR ai.title ILIKE $${params.length})`); }
    const result = await query(
      `SELECT ai.id, ai.title, ai.status, ai.difficulty, ai.question_count, ai.duration_minutes,
              ai.expires_at, ai.started_at, ai.completed_at, ai.overall_score, ai.integrity_risk,
              ai.ai_recommendation, ai.recruiter_decision, ai.video_status, ai.transcription_status,
              ai.evaluation_status, ai.created_at, c.id AS candidate_id, c.full_name AS candidate_name,
              c.email AS candidate_email, j.id AS job_id, j.title AS job_title,
              u.full_name AS created_by_name
         FROM ai_interviews ai
         JOIN candidates c ON c.id=ai.candidate_id
         JOIN jobs j ON j.id=ai.job_id
         JOIN users u ON u.id=ai.created_by_user_id
         LEFT JOIN applications a ON a.id=ai.application_id
        WHERE ${where.join(" AND ")}
        ORDER BY ai.created_at DESC LIMIT 250`,
      params
    );
    return NextResponse.json({ interviews: result.rows, configuration: { enabled: true, recording_enabled: aiInterviewConfig.recordingEnabled, can_delete: auth.access.permissions["ai_interviews.delete"] === true } });
  } catch (error) {
    console.error("[ai-interviews] list", error);
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAiInterviewEnabled();
    const auth = await requirePermission("ai_interviews.create");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = createInterviewSchema.parse(await request.json());
    const source = await query(
      `SELECT j.id AS job_id, j.title, j.description, j.experience_requirement, j.created_by_user_id,
              c.id AS candidate_id, c.resume_text,
              a.id AS application_id, a.assigned_recruiter_user_id
         FROM jobs j CROSS JOIN candidates c
         LEFT JOIN applications a ON a.job_id=j.id AND a.candidate_id=c.id AND ($3::bigint IS NULL OR a.id=$3)
        WHERE j.id=$1 AND c.id=$2 LIMIT 1`,
      [parsed.job_id, parsed.candidate_id, parsed.application_id || null]
    );
    if (!source.rowCount) return NextResponse.json({ error: "Candidate, job, or application was not found." }, { status: 404 });
    const row = source.rows[0];
    if (parsed.application_id && !row.application_id) return NextResponse.json({ error: "Application does not match the selected candidate and job." }, { status: 400 });
    if (auth.access.role !== "admin" && Number(row.created_by_user_id) !== auth.access.user_id && Number(row.assigned_recruiter_user_id) !== auth.access.user_id) {
      const team = await query(`SELECT 1 FROM job_team WHERE job_id=$1 AND user_id=$2 LIMIT 1`, [parsed.job_id, auth.access.user_id]);
      if (!team.rowCount) return NextResponse.json({ error: "You do not have access to this job." }, { status: 403 });
    }

    const token = createSecureInterviewToken();
    const generated = await generateQuestions({
      title: row.title, description: row.description || "", experienceRequirement: row.experience_requirement || "",
      skills: parsed.skills, resumeText: row.resume_text || "", difficulty: parsed.difficulty,
      count: parsed.question_count, durationMinutes: parsed.duration_minutes,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO ai_interviews (
          job_id,candidate_id,application_id,created_by_user_id,secure_token_hash,status,title,instructions,difficulty,
          skills_json,question_count,duration_minutes,expires_at,look_away_warning_limit,tab_switch_warning_limit,
          face_missing_threshold_seconds,recording_enabled,screen_share_enabled,fullscreen_required,
          face_monitoring_enabled,gaze_monitoring_enabled
        ) VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *`,
        [parsed.job_id,parsed.candidate_id,row.application_id||null,auth.access.user_id,hashInterviewToken(token),parsed.title,
          parsed.instructions,parsed.difficulty,JSON.stringify(parsed.skills),parsed.question_count,parsed.duration_minutes,
          parsed.expires_at,parsed.look_away_warning_limit,parsed.tab_switch_warning_limit,parsed.face_missing_threshold_seconds,
          parsed.recording_enabled && aiInterviewConfig.recordingEnabled,parsed.screen_share_enabled && aiInterviewConfig.screenShareEnabled,
          parsed.fullscreen_required,parsed.face_monitoring_enabled && aiInterviewConfig.faceMonitoringEnabled,
          parsed.gaze_monitoring_enabled && aiInterviewConfig.gazeMonitoringEnabled]
      );
      const interviewId = Number(inserted.rows[0].id);
      for (let index = 0; index < generated.questions.length; index += 1) {
        const question = generated.questions[index];
        await client.query(
          `INSERT INTO ai_interview_questions (interview_id,order_number,question_text,skill_name,difficulty,expected_points_json,scoring_rubric_json,max_score,generated_by_ai)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
          [interviewId,index+1,question.question,question.skill,question.difficulty,JSON.stringify(question.expectedPoints),JSON.stringify(question.scoringRubric),question.maxScore,generated.mode==="AI"]
        );
      }
      await client.query(
        `INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type,metadata_json)
         VALUES ($1,$2,'CREATED',$3::jsonb)`,
        [interviewId,auth.access.user_id,JSON.stringify({ generation_mode: generated.mode, generation_model: generated.model })]
      );
      await client.query("COMMIT");
      return NextResponse.json({
        interview: inserted.rows[0], questions: generated.questions, generation_mode: generated.mode,
        public_url: buildPublicUrl(`/ai-interview/${token}`),
      }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) {
    console.error("[ai-interviews] create", error);
    return errorResponse(error);
  }
}
