import { query } from "@/lib/db";
import type { AuthAccess } from "@/lib/rbac";
import type { HrActionSpec } from "./types";
import { PIPELINE_STAGES } from "./types";
import { applicationsScopeSql, jobsScopeSql } from "./visibility";

function isStage(s: string) {
  return (PIPELINE_STAGES as readonly string[]).includes(s);
}

export type ActionResult =
  | { ok: true; message: string; data?: Record<string, unknown> }
  | { ok: false; error: string };

export async function executeHrAction(access: AuthAccess, action: HrActionSpec): Promise<ActionResult> {
  switch (action.type) {
    case "move_stage":
      return moveStage(access, action);
    case "schedule_interview":
      return scheduleInterview(access, action);
    case "update_job_status":
      return updateJobStatus(access, action);
    case "add_job_team_member":
      return addJobTeamMember(access, action);
    default:
      return { ok: false, error: "Unknown action type" };
  }
}

async function assertApplicationAccess(access: AuthAccess, applicationId: number) {
  const params: unknown[] = [];
  const scope = await applicationsScopeSql(access, params);
  params.push(applicationId);
  const res = await query(
    `SELECT a.id, a.stage FROM applications a WHERE a.id = $${params.length} AND (${scope})`,
    params
  );
  if (res.rowCount === 0) return null;
  return res.rows[0] as { id: number; stage: string };
}

async function moveStage(access: AuthAccess, action: HrActionSpec): Promise<ActionResult> {
  const id = action.application_id;
  const stage = action.new_stage;
  if (!id || !stage) return { ok: false, error: "application_id and new_stage are required" };
  if (!isStage(stage)) return { ok: false, error: `Invalid stage: ${stage}` };
  if (stage === "Rejected") {
    return {
      ok: false,
      error: "Moving to Rejected requires a disposition reason. Please update the application from the Pipeline page.",
    };
  }

  const row = await assertApplicationAccess(access, id);
  if (!row) return { ok: false, error: "Application not found or not accessible" };

  const res = await query(
    `
    UPDATE applications
    SET stage = $1, status = $1, updated_at = NOW()
    WHERE id = $2 AND created_by_user_id = $3
    RETURNING id, stage
    `,
    [stage, id, access.user_id]
  );
  if (res.rowCount === 0) {
    return {
      ok: false,
      error: "You can only change stages for applications you own. Ask an admin or the job owner to transfer ownership if needed.",
    };
  }
  return {
    ok: true,
    message: `Application #${id} moved to **${stage}**.`,
    data: res.rows[0] as Record<string, unknown>,
  };
}

function defaultInterviewIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

async function scheduleInterview(access: AuthAccess, action: HrActionSpec): Promise<ActionResult> {
  const id = action.application_id;
  if (!id) return { ok: false, error: "application_id is required" };
  const iso = action.interview_iso?.trim() || defaultInterviewIso();

  const row = await assertApplicationAccess(access, id);
  if (!row) return { ok: false, error: "Application not found or not accessible" };

  const res = await query(
    `
    UPDATE applications
    SET stage = 'Interview',
        status = 'Interview',
        interview_scheduled = true,
        interview_datetime = $1::timestamptz,
        updated_at = NOW()
    WHERE id = $2 AND created_by_user_id = $3
    RETURNING id, interview_datetime, stage
    `,
    [iso, id, access.user_id]
  );
  if (res.rowCount === 0) {
    return { ok: false, error: "Only the application owner can schedule interviews for this record." };
  }
  return {
    ok: true,
    message: `Interview scheduled for application #${id} at ${iso}.`,
    data: res.rows[0] as Record<string, unknown>,
  };
}

async function assertJobAccess(access: AuthAccess, jobId: number) {
  const params: unknown[] = [];
  const scope = await jobsScopeSql(access, params, "j");
  params.push(jobId);
  const res = await query(`SELECT j.id FROM jobs j WHERE j.id = $${params.length} AND (${scope})`, params);
  return res.rowCount > 0;
}

async function updateJobStatus(access: AuthAccess, action: HrActionSpec): Promise<ActionResult> {
  const jobId = action.job_id;
  const status = action.job_status?.trim();
  if (!jobId || !status) return { ok: false, error: "job_id and job_status are required" };

  const ok = await assertJobAccess(access, jobId);
  if (!ok) return { ok: false, error: "Job not found or not accessible" };

  const res = await query(
    `
    UPDATE jobs SET status = $1, updated_at = NOW()
    WHERE id = $2 AND created_by_user_id = $3
    RETURNING id, status
    `,
    [status, jobId, access.user_id]
  );
  if (res.rowCount === 0) {
    return {
      ok: false,
      error: "Only the job owner can update status from the assistant. Team members can edit from the job page if permitted.",
    };
  }
  return {
    ok: true,
    message: `Job #${jobId} status set to **${status}**.`,
    data: res.rows[0] as Record<string, unknown>,
  };
}

async function addJobTeamMember(access: AuthAccess, action: HrActionSpec): Promise<ActionResult> {
  const jobId = action.job_id;
  const email = action.target_user_email?.trim().toLowerCase();
  const role = action.team_role ?? "recruiter";
  if (!jobId || !email) return { ok: false, error: "job_id and target_user_email are required" };

  const ok = await assertJobAccess(access, jobId);
  if (!ok) return { ok: false, error: "Job not found or not accessible" };

  const ownerCheck = await query(`SELECT id FROM jobs WHERE id = $1 AND created_by_user_id = $2`, [
    jobId,
    access.user_id,
  ]);
  if (ownerCheck.rowCount === 0) {
    return { ok: false, error: "Only the job owner can add team members via the assistant." };
  }

  const ures = await query(`SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
  if (ures.rowCount === 0) return { ok: false, error: `No user found with email ${email}` };
  const newUserId = (ures.rows[0] as { id: number }).id;

  try {
    await query(
      `
      INSERT INTO job_team (job_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (job_id, user_id, role) DO NOTHING
      `,
      [jobId, newUserId, role]
    );
  } catch (e) {
    console.error("add_job_team_member", e);
    return { ok: false, error: "Could not add team member (job_team table missing or conflict)." };
  }

  return {
    ok: true,
    message: `Added **${email}** to job #${jobId} as ${role.replace("_", " ")}.`,
    data: { job_id: jobId, user_id: newUserId, role },
  };
}
