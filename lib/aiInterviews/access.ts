import { query } from "@/lib/db";
import type { AuthAccess } from "@/lib/rbac";
import { readCandidateSession } from "@/lib/aiInterviews/token";

export async function canAccessAiInterview(access: AuthAccess, interviewId: number) {
  if (access.role === "admin") return true;
  const result = await query(
    `SELECT 1
       FROM ai_interviews ai
       JOIN jobs j ON j.id = ai.job_id
       LEFT JOIN applications a ON a.id = ai.application_id
      WHERE ai.id = $1
        AND (
          ai.created_by_user_id = $2 OR j.created_by_user_id = $2 OR a.assigned_recruiter_user_id = $2 OR
          EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = ai.job_id AND jt.user_id = $2)
        )
      LIMIT 1`,
    [interviewId, access.user_id]
  );
  return result.rowCount > 0;
}

export async function requireCandidateInterview() {
  const session = await readCandidateSession();
  if (!session) return null;
  const result = await query(
    `SELECT ai.*, c.full_name AS candidate_name, c.email AS candidate_email,
            j.title AS job_title, j.description AS job_description
       FROM ai_interviews ai
       JOIN candidates c ON c.id = ai.candidate_id
       JOIN jobs j ON j.id = ai.job_id
      WHERE ai.id = $1 AND ai.candidate_id = $2 AND ai.secure_token_hash = $3 AND ai.token_revoked_at IS NULL
      LIMIT 1`,
    [session.interviewId, session.candidateId, session.tokenHash]
  );
  if (!result.rowCount) return null;
  return result.rows[0];
}
