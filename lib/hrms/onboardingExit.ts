import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export type WorkflowType = "onboarding" | "exit";

export async function listOnboardingExit(params: {
  actorUserId: number;
  role: string;
  workflowType?: WorkflowType;
}) {
  const values: Array<string | number> = [];
  let whereParts: string[] = [];
  let idx = 1;

  if (params.role === "employee") {
    whereParts.push(`e.user_id = $${idx++}`);
    values.push(params.actorUserId);
  } else if (params.role === "hiring_manager" || params.role === "manager") {
    whereParts.push(`u.reporting_manager_user_id = $${idx++}`);
    values.push(params.actorUserId);
  }

  if (params.workflowType) {
    whereParts.push(`e.workflow_type = $${idx++}`);
    values.push(params.workflowType);
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
  const res = await query(
    `
      SELECT
        e.*,
        COALESCE(u.full_name, '') AS user_name
      FROM employee_onboarding_exit e
      JOIN users u ON u.id = e.user_id
      ${whereSql}
      ORDER BY e.updated_at DESC, e.id DESC
    `,
    values,
  );
  return res.rows;
}

export async function createWorkflow(input: {
  userId: number;
  workflowType: WorkflowType;
  checklist?: Record<string, unknown>;
  resignationReason?: string | null;
  noticeStartDate?: string | null;
  noticeEndDate?: string | null;
  actorUserId: number;
}) {
  const ins = await query(
    `
      INSERT INTO employee_onboarding_exit
      (user_id, workflow_type, checklist, resignation_reason, notice_start_date, notice_end_date, status, created_by_user_id, created_at, updated_at)
      VALUES ($1,$2,$3::jsonb,$4,$5::date,$6::date,'in_progress',$7,NOW(),NOW())
      RETURNING id
    `,
    [
      input.userId,
      input.workflowType,
      JSON.stringify(input.checklist || {}),
      input.resignationReason || null,
      input.noticeStartDate || null,
      input.noticeEndDate || null,
      input.actorUserId,
    ],
  );
  const id = Number(ins.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "hrms.onboarding_exit.created",
    metadata: { workflow_id: id, workflow_type: input.workflowType, user_id: input.userId },
  });
  return id;
}

export async function updateWorkflow(input: {
  id: number;
  checklist?: Record<string, unknown>;
  status?: string;
  finalSettlementStatus?: string | null;
  resignationReason?: string | null;
  noticeStartDate?: string | null;
  noticeEndDate?: string | null;
  decision?: "approved" | "rejected" | null;
  actorUserId: number;
}) {
  const currentRes = await query(`SELECT * FROM employee_onboarding_exit WHERE id = $1 LIMIT 1`, [input.id]);
  if (currentRes.rowCount === 0) return false;
  const current = currentRes.rows[0] as any;
  const status = input.status || current.status || "in_progress";

  await query(
    `
      UPDATE employee_onboarding_exit
      SET
        checklist = $2::jsonb,
        status = $3,
        final_settlement_status = $4,
        resignation_reason = $5,
        notice_start_date = $6::date,
        notice_end_date = $7::date,
        approved_by_user_id = $8,
        approved_at = $9,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      input.id,
      JSON.stringify(input.checklist || current.checklist || {}),
      status,
      input.finalSettlementStatus ?? current.final_settlement_status ?? null,
      input.resignationReason ?? current.resignation_reason ?? null,
      input.noticeStartDate ?? current.notice_start_date ?? null,
      input.noticeEndDate ?? current.notice_end_date ?? null,
      input.decision ? input.actorUserId : current.approved_by_user_id ?? null,
      input.decision ? new Date().toISOString() : current.approved_at ?? null,
    ],
  );
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "hrms.onboarding_exit.updated",
    metadata: { workflow_id: input.id, decision: input.decision || null, status },
  });
  return true;
}
