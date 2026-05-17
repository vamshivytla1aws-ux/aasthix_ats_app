import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export async function listPerformanceCycles() {
  const res = await query(`SELECT * FROM performance_cycles ORDER BY end_date DESC, id DESC`, []);
  return res.rows;
}

export async function listPerformanceGoals(cycleId?: number) {
  const values: number[] = [];
  const where = cycleId && cycleId > 0 ? "WHERE g.cycle_id = $1" : "";
  if (cycleId && cycleId > 0) values.push(cycleId);
  const res = await query(
    `
      SELECT
        g.*,
        COALESCE(u.full_name, '') AS employee_name
      FROM performance_goals g
      JOIN users u ON u.id = g.employee_id
      ${where}
      ORDER BY g.created_at DESC
    `,
    values,
  );
  return res.rows;
}

export async function createPerformanceCycle(input: {
  name: string;
  startDate: string;
  endDate: string;
  actorUserId: number;
}) {
  const ins = await query(
    `
      INSERT INTO performance_cycles
      (name, start_date, end_date, status, created_by_user_id, created_at, updated_at)
      VALUES ($1,$2::date,$3::date,'open',$4,NOW(),NOW())
      RETURNING id
    `,
    [input.name, input.startDate, input.endDate, input.actorUserId],
  );
  const id = Number(ins.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "hrms.performance.cycle.created",
    metadata: { cycle_id: id, name: input.name },
  });
  return id;
}

export async function createPerformanceGoal(input: {
  cycleId: number;
  employeeId: number;
  title: string;
  description: string;
  weightPercent: number;
  actorUserId: number;
}) {
  const ins = await query(
    `
      INSERT INTO performance_goals
      (cycle_id, employee_id, title, description, weight_percent, created_by_user_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
      RETURNING id
    `,
    [input.cycleId, input.employeeId, input.title, input.description, input.weightPercent, input.actorUserId],
  );
  const id = Number(ins.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "hrms.performance.goal.created",
    metadata: { goal_id: id, cycle_id: input.cycleId, employee_id: input.employeeId },
  });
  return id;
}

export async function listPerformanceReviews(params: {
  actorUserId: number;
  role: string;
  cycleId?: number;
}) {
  const values: Array<number> = [];
  const where: string[] = [];
  let idx = 1;
  if (params.role === "employee") {
    where.push(`r.employee_id = $${idx++}`);
    values.push(params.actorUserId);
  } else if (params.role === "hiring_manager" || params.role === "manager") {
    where.push(`u.reporting_manager_user_id = $${idx++}`);
    values.push(params.actorUserId);
  }
  if (params.cycleId && Number(params.cycleId) > 0) {
    where.push(`r.cycle_id = $${idx++}`);
    values.push(Number(params.cycleId));
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const res = await query(
    `
      SELECT
        r.*,
        COALESCE(u.full_name, '') AS employee_name,
        COALESCE(c.name, '') AS cycle_name
      FROM performance_reviews r
      JOIN users u ON u.id = r.employee_id
      JOIN performance_cycles c ON c.id = r.cycle_id
      ${whereSql}
      ORDER BY r.updated_at DESC, r.id DESC
    `,
    values,
  );
  return res.rows;
}

export async function upsertPerformanceReview(input: {
  cycleId: number;
  employeeId: number;
  selfReview?: Record<string, unknown>;
  managerReview?: Record<string, unknown>;
  hrReview?: Record<string, unknown>;
  rating?: number | null;
  recommendation?: string | null;
  status?: string;
  actorUserId: number;
}) {
  const upsert = await query(
    `
      INSERT INTO performance_reviews
      (cycle_id, employee_id, self_review, manager_review, hr_review, rating, recommendation, status, updated_at, created_at)
      VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (cycle_id, employee_id)
      DO UPDATE SET
        self_review = EXCLUDED.self_review,
        manager_review = EXCLUDED.manager_review,
        hr_review = EXCLUDED.hr_review,
        rating = EXCLUDED.rating,
        recommendation = EXCLUDED.recommendation,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id
    `,
    [
      input.cycleId,
      input.employeeId,
      JSON.stringify(input.selfReview || {}),
      JSON.stringify(input.managerReview || {}),
      JSON.stringify(input.hrReview || {}),
      input.rating == null ? null : Number(input.rating),
      input.recommendation || null,
      input.status || "submitted",
    ],
  );
  const id = Number(upsert.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "hrms.performance.review.upserted",
    metadata: { review_id: id, cycle_id: input.cycleId, employee_id: input.employeeId, status: input.status || "submitted" },
  });
  return id;
}
