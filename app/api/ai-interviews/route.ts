import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  requireAiInterviewEnabled,
  aiInterviewConfig,
} from "@/lib/aiInterviews/config";
import { createInterviewSchema } from "@/lib/aiInterviews/schemas";
import {
  createSecureInterviewToken,
  hashInterviewToken,
} from "@/lib/aiInterviews/token";
import { generateQuestions } from "@/lib/aiInterviews/provider";
import {
  buildAdaptiveInterviewPlan,
  toStoredQuestion,
  type AdaptiveConfig,
} from "@/lib/aiInterviews/adaptive";
import { buildPublicUrl } from "@/lib/publicUrl";
import { resolveAiInterviewResumeContext } from "@/lib/aiInterviews/resumeContext";
import { sendAiInterviewInviteEmail } from "@/lib/aiInterviews/inviteEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 500;
  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "AI interview request failed",
    },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    requireAiInterviewEnabled();
    const auth = await requirePermission("ai_interviews.view");
    if (!auth.ok)
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "")
      .trim()
      .toUpperCase();
    const search = String(url.searchParams.get("search") || "").trim();
    const hasFullAccess =
      auth.access.role === "admin" ||
      auth.access.role === "workspace_owner" ||
      auth.access.access_scope === "all";
    const params: unknown[] =
      hasFullAccess ? [] : [auth.access.user_id];
    const where = [
      hasFullAccess
        ? "TRUE"
        : `(
      ai.created_by_user_id=$1 OR j.created_by_user_id=$1 OR a.assigned_recruiter_user_id=$1 OR
      EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id=ai.job_id AND jt.user_id=$1)
    )`,
    ];
    if (status) {
      params.push(status);
      where.push(`ai.status=$${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(c.full_name ILIKE $${params.length} OR j.title ILIKE $${params.length} OR ai.title ILIKE $${params.length})`,
      );
    }
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
      params,
    );
    return NextResponse.json({
      interviews: result.rows,
      configuration: {
        enabled: true,
        recording_enabled: aiInterviewConfig.recordingEnabled,
        can_delete: auth.access.permissions["ai_interviews.delete"] === true,
      },
    });
  } catch (error) {
    console.error("[ai-interviews] list", error);
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAiInterviewEnabled();
    const auth = await requirePermission("ai_interviews.create");
    if (!auth.ok)
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = createInterviewSchema.parse(await request.json());
    const source = await query(
      `SELECT j.id AS job_id, j.title, j.description, j.experience_requirement, j.created_by_user_id,
              c.id AS candidate_id, c.resume_text,c.resume_file_name,c.resume_blob,
              a.id AS application_id, a.assigned_recruiter_user_id
         FROM jobs j CROSS JOIN candidates c
         LEFT JOIN applications a ON a.job_id=j.id AND a.candidate_id=c.id AND ($3::bigint IS NULL OR a.id=$3)
        WHERE j.id=$1 AND c.id=$2 LIMIT 1`,
      [parsed.job_id, parsed.candidate_id, parsed.application_id || null],
    );
    if (!source.rowCount)
      return NextResponse.json(
        { error: "Candidate, job, or application was not found." },
        { status: 404 },
      );
    const row = source.rows[0];
    if (parsed.application_id && !row.application_id)
      return NextResponse.json(
        { error: "Application does not match the selected candidate and job." },
        { status: 400 },
      );
    const hasFullJobAccess =
      auth.access.role === "admin" ||
      auth.access.role === "workspace_owner" ||
      auth.access.access_scope === "all" ||
      Number(row.created_by_user_id) === auth.access.user_id ||
      Number(row.assigned_recruiter_user_id) === auth.access.user_id;

    if (!hasFullJobAccess) {
      const team = await query(
        `SELECT 1 FROM job_team WHERE job_id=$1 AND user_id=$2 LIMIT 1`,
        [parsed.job_id, auth.access.user_id],
      );
      if (!team.rowCount)
        return NextResponse.json(
          { error: "You do not have access to this job." },
          { status: 403 },
        );
    }

    const resumeContext = await resolveAiInterviewResumeContext(row);
    if (
      resumeContext.source === "UPLOADED_RESUME" &&
      resumeContext.text !== String(row.resume_text || "").trim()
    ) {
      await query(
        `UPDATE candidates SET resume_text=$2,updated_at=NOW() WHERE id=$1`,
        [parsed.candidate_id, resumeContext.text],
      );
    }
    const token = createSecureInterviewToken();
    const adaptiveConfig: AdaptiveConfig = {
      maxQuestions: parsed.question_count,
      projectQuestionsEnabled: parsed.project_questions_enabled,
      minProjectQuestions: parsed.min_project_questions,
      maxFollowUpsPerTopic: parsed.max_followups_per_topic,
      scenarioPercentage: parsed.scenario_percentage,
      recruiterExperienceOverride: parsed.recruiter_experience_override ?? null,
      codingEnabled: parsed.coding_enabled,
      behavioralEnabled: parsed.behavioral_enabled,
      allowFundamentalsForSenior: parsed.allow_fundamentals_for_senior,
      windowStart: parsed.windowStart,
    };
    const adaptivePlan =
      parsed.interview_mode === "ADAPTIVE"
        ? await buildAdaptiveInterviewPlan({
            title: row.title,
            jd: `${row.description || ""}\n${row.experience_requirement || ""}`,
            resume: resumeContext.text,
            skills: parsed.skills,
            config: adaptiveConfig,
            sourceQuality: resumeContext.sourceQuality,
            resumeSource: resumeContext.source,
          })
        : null;
    const generated = adaptivePlan
      ? {
          questions: [toStoredQuestion(adaptivePlan.opening)],
          mode: "AI",
          model: adaptivePlan.model,
        }
      : await generateQuestions({
          title: row.title,
          description: row.description || "",
          experienceRequirement: row.experience_requirement || "",
          skills: parsed.skills,
          resumeText: resumeContext.text,
          difficulty: parsed.difficulty,
          count: parsed.question_count,
          durationMinutes: parsed.duration_minutes,
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
        [
          parsed.job_id,
          parsed.candidate_id,
          row.application_id || null,
          auth.access.user_id,
          hashInterviewToken(token),
          `AASTHIX - AI Interview - ${String(row.title).trim()}`,
          parsed.instructions,
          parsed.difficulty,
          JSON.stringify(parsed.skills),
          parsed.question_count,
          parsed.duration_minutes,
          parsed.expires_at,
          parsed.look_away_warning_limit,
          parsed.tab_switch_warning_limit,
          parsed.face_missing_threshold_seconds,
          parsed.recording_enabled && aiInterviewConfig.recordingEnabled,
          parsed.screen_share_enabled && aiInterviewConfig.screenShareEnabled,
          parsed.fullscreen_required,
          parsed.face_monitoring_enabled &&
            aiInterviewConfig.faceMonitoringEnabled,
          parsed.gaze_monitoring_enabled &&
            aiInterviewConfig.gazeMonitoringEnabled,
        ],
      );
      const interviewId = Number(inserted.rows[0].id);
      await client.query(
        `UPDATE ai_interviews SET question_generation_model=$2,interview_mode=$3,interview_context_json=$4::jsonb,
        adaptive_config_json=$5::jsonb,skill_coverage_json=$6::jsonb,adaptive_state_json=$7::jsonb,context_source_quality=$8 WHERE id=$1`,
        [
          interviewId,
          generated.model,
          parsed.interview_mode,
          JSON.stringify(adaptivePlan?.context || {}),
          JSON.stringify(adaptiveConfig),
          JSON.stringify(adaptivePlan?.coverage || []),
          JSON.stringify(adaptivePlan?.state || {}),
          adaptivePlan?.context.sourceQuality || null,
        ],
      );
      for (let index = 0; index < generated.questions.length; index += 1) {
        const question: any = generated.questions[index];
        await client.query(
          `INSERT INTO ai_interview_questions (interview_id,order_number,question_text,skill_name,difficulty,expected_points_json,scoring_rubric_json,max_score,generated_by_ai,
             adaptive_strategy,source_type,source_reference,reason_for_asking,project_name,expected_signals_json,adaptive_depth,runtime_generated)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)`,
          [
            interviewId,
            index + 1,
            question.question,
            question.skill,
            question.dbDifficulty || question.difficulty,
            JSON.stringify(
              question.expectedPoints || question.expectedSignals || [],
            ),
            JSON.stringify(question.scoringRubric || []),
            question.maxScore || 10,
            generated.mode === "AI",
            question.strategy || null,
            question.sourceType || null,
            question.sourceReference || null,
            question.reasonForAsking || null,
            question.projectName || null,
            JSON.stringify(question.expectedSignals || []),
            question.difficulty && question.dbDifficulty
              ? question.difficulty
              : null,
            false,
          ],
        );
      }
      await client.query(
        `INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type,metadata_json)
         VALUES ($1,$2,'CREATED',$3::jsonb)`,
        [
          interviewId,
          auth.access.user_id,
          JSON.stringify({
            generation_mode: generated.mode,
            generation_model: generated.model,
          }),
        ],
      );
      await client.query("COMMIT");

      let emailResult: Record<string, unknown> | null = null;
      if (parsed.send_email) {
        try {
          const invite = await sendAiInterviewInviteEmail(interviewId, auth.access.user_id);
          emailResult = invite;
        } catch (e) {
          console.error("Auto send AI interview invite email failed:", e);
        }
      }

      return NextResponse.json(
        {
          interview: inserted.rows[0],
          questions: generated.questions,
          generation_mode: generated.mode,
          public_url: (emailResult as any)?.public_url || buildPublicUrl(`/ai-interview/${token}`),
          email_sent: Boolean((emailResult as any)?.ok),
          recipient: (emailResult as any)?.recipient,
        },
        { status: 201 },
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[ai-interviews] create", error);
    return errorResponse(error);
  }
}
