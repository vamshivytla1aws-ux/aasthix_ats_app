import { query } from "@/lib/db";
import type { AuthAccess } from "@/lib/rbac";
import type { HrAssistantPlan, HrFilters, HrQueryResult, HrVerificationMeta } from "./types";
import { PIPELINE_STAGES } from "./types";
import { applicationsScopeSql, candidatesScopeSql, jobsScopeSql } from "./visibility";
import { getHrAssistantReportingTimezone } from "./relativeDates";
import {
  candidatesHasExperience,
  candidatesHasSkillsCsv,
  candidatesHasSkillset,
  hasJobSkillProfilesTable,
  jobsHasExperienceRequirement,
} from "./schemaCache";

const MAX_ROWS = 50;

function isStage(s: string) {
  return (PIPELINE_STAGES as readonly string[]).includes(s);
}

function canViewBoard(access: AuthAccess, permissionKey: string) {
  return access.role === "admin" || access.permissions[permissionKey] !== false;
}

function isSelectedStage(stage: string | null | undefined) {
  return String(stage || "").trim().toLowerCase() === "selected";
}

function isStrictCriticalCount(plan: HrAssistantPlan) {
  if (plan.kind !== "query") return false;
  if ((plan.analytics?.metric ?? "count") !== "count") return false;
  return plan.entity === "applications" || plan.entity === "interviews" || Boolean(plan.filters?.stage);
}

function addDateRange(
  filters: HrFilters | undefined,
  params: unknown[],
  where: string[],
  column: string
) {
  if (filters?.date_from) {
    params.push(filters.date_from);
    where.push(`${column} >= $${params.length}::timestamptz`);
  }
  if (filters?.date_to) {
    params.push(filters.date_to);
    where.push(`${column} <= $${params.length}::timestamptz`);
  }
}

/**
 * For interview lists: window on scheduled time when set, else created_at for Interview/scheduled rows.
 */
function addInterviewCalendarWindow(filters: HrFilters | undefined, params: unknown[], where: string[]) {
  if (!filters?.date_from && !filters?.date_to) return;
  let fromIdx: number | null = null;
  let toIdx: number | null = null;
  if (filters.date_from) {
    params.push(filters.date_from);
    fromIdx = params.length;
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    toIdx = params.length;
  }
  const intParts = [
    "a.interview_datetime IS NOT NULL",
    fromIdx !== null ? `a.interview_datetime >= $${fromIdx}::timestamptz` : null,
    toIdx !== null ? `a.interview_datetime <= $${toIdx}::timestamptz` : null,
  ].filter(Boolean) as string[];
  const creParts = [
    "a.interview_datetime IS NULL",
    "(a.stage = 'Interview' OR a.interview_scheduled = true)",
    fromIdx !== null ? `a.created_at >= $${fromIdx}::timestamptz` : null,
    toIdx !== null ? `a.created_at <= $${toIdx}::timestamptz` : null,
  ].filter(Boolean) as string[];
  where.push(`((${intParts.join(" AND ")}) OR (${creParts.join(" AND ")}))`);
}

async function addCandidateSkillFilters(filters: HrFilters | undefined, params: unknown[], where: string[]) {
  if (!filters?.skills?.length) return;
  const hasCsv = await candidatesHasSkillsCsv();
  const hasSkillset = await candidatesHasSkillset();

  for (const raw of filters.skills) {
    const t = String(raw).trim();
    if (t.length < 2) continue;
    params.push(`%${t}%`);
    const i = params.length;
    if (!hasCsv && !hasSkillset) {
      where.push(
        `(c.full_name ILIKE $${i} OR COALESCE(c.email,'') ILIKE $${i} OR COALESCE(c.location,'') ILIKE $${i})`
      );
      continue;
    }
    const csv = hasCsv
      ? `(EXISTS (SELECT 1 FROM unnest(string_to_array(COALESCE(c.skills, ''), ',')) AS s WHERE trim(s) ILIKE $${i}) OR COALESCE(c.skills, '') ILIKE $${i})`
      : null;
    const arr = hasSkillset
      ? `EXISTS (SELECT 1 FROM unnest(COALESCE(c.skillset, ARRAY[]::text[])) AS sk WHERE sk ILIKE $${i})`
      : null;
    const parts = [csv, arr].filter(Boolean) as string[];
    if (parts.length) where.push(`(${parts.join(" OR ")})`);
  }
}

async function addJobSkillFilters(filters: HrFilters | undefined, params: unknown[], where: string[]) {
  if (!filters?.skills?.length) return;
  const jsp = await hasJobSkillProfilesTable();
  const hasExp = await jobsHasExperienceRequirement();
  for (const raw of filters.skills) {
    const t = String(raw).trim();
    if (t.length < 2) continue;
    params.push(`%${t}%`);
    const i = params.length;
    const expClause = hasExp ? ` OR COALESCE(j.experience_requirement,'') ILIKE $${i}` : "";
    const textMatch = `(j.title ILIKE $${i} OR j.company ILIKE $${i} OR COALESCE(j.description,'') ILIKE $${i}${expClause})`;
    if (jsp) {
      where.push(
        `(${textMatch} OR EXISTS (SELECT 1 FROM job_skill_profiles jsp WHERE jsp.job_id = j.id AND (COALESCE(jsp.must_have_skills,'') ILIKE $${i} OR COALESCE(jsp.nice_to_have_skills,'') ILIKE $${i} OR COALESCE(jsp.role_keywords,'') ILIKE $${i})))`
      );
    } else {
      where.push(`(${textMatch})`);
    }
  }
}

async function candidatesSelectShape(): Promise<{ selectSql: string; columns: string[] }> {
  const hasSkills = await candidatesHasSkillsCsv();
  const hasExp = await candidatesHasExperience();
  const cols: string[] = ["id", "full_name", "email", "phone", "location"];
  const sqlParts = ["c.id", "c.full_name", "c.email", "c.phone", "c.location"];
  if (hasSkills) {
    cols.push("skills");
    sqlParts.push("c.skills");
  }
  if (hasExp) {
    cols.push("experience");
    sqlParts.push("c.experience");
  }
  cols.push("created_at");
  sqlParts.push("c.created_at");
  return { selectSql: sqlParts.join(", "), columns: cols };
}

async function jobsSelectColumns(): Promise<{ sql: string; columns: string[] }> {
  const hasExp = await jobsHasExperienceRequirement();
  if (hasExp) {
    return {
      sql: "j.id, j.title, j.company, j.location, j.status, j.employment_type, j.open_positions, j.experience_requirement, j.created_at",
      columns: [
        "id",
        "title",
        "company",
        "location",
        "status",
        "employment_type",
        "open_positions",
        "experience_requirement",
        "created_at",
      ],
    };
  }
  return {
    sql: "j.id, j.title, j.company, j.location, j.status, j.employment_type, j.open_positions, j.created_at",
    columns: ["id", "title", "company", "location", "status", "employment_type", "open_positions", "created_at"],
  };
}

export async function runHrQuery(access: AuthAccess, plan: HrAssistantPlan): Promise<HrQueryResult> {
  const filters = plan.filters ?? {};
  const entity = plan.entity;

  if (entity === "analytics" || plan.analytics) {
    return runAnalytics(access, plan);
  }

  if (entity === "candidates") {
    return queryCandidates(access, filters);
  }
  if (entity === "jobs") {
    return queryJobs(access, filters);
  }
  if (entity === "applications") {
    return queryApplications(access, filters, false);
  }
  if (entity === "interviews") {
    return queryApplications(access, filters, true);
  }
  if (entity === "offers") {
    return queryOffers(access, filters);
  }

  return { columns: [], rows: [], entity: null };
}

async function queryCandidates(access: AuthAccess, filters: HrFilters): Promise<HrQueryResult> {
  const params: unknown[] = [];
  const where: string[] = [candidatesScopeSql(access, params, "c")];
  const hasExp = await candidatesHasExperience();

  if (filters.search_text?.trim()) {
    params.push(`%${filters.search_text.trim()}%`);
    const i = params.length;
    where.push(`(c.full_name ILIKE $${i} OR COALESCE(c.email,'') ILIKE $${i} OR COALESCE(c.location,'') ILIKE $${i})`);
  }
  if (filters.location?.trim()) {
    params.push(`%${filters.location.trim()}%`);
    where.push(`c.location ILIKE $${params.length}`);
  }
  if (hasExp && typeof filters.experience_min_years === "number") {
    params.push(filters.experience_min_years);
    where.push(`c.experience >= $${params.length}`);
  }
  if (hasExp && typeof filters.experience_max_years === "number") {
    params.push(filters.experience_max_years);
    where.push(`c.experience <= $${params.length}`);
  }
  if (typeof filters.candidate_id === "number" && filters.candidate_id > 0) {
    params.push(filters.candidate_id);
    where.push(`c.id = $${params.length}`);
  }
  await addCandidateSkillFilters(filters, params, where);
  addDateRange(filters, params, where, "c.created_at");

  const { selectSql, columns } = await candidatesSelectShape();
  const whereSql = where.join(" AND ");
  const sql = `
    SELECT ${selectSql}
    FROM candidates c
    WHERE ${whereSql}
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT ${MAX_ROWS}
  `;
  const res = await query(sql, params);
  return {
    entity: "candidates",
    columns,
    rows: res.rows as Record<string, unknown>[],
  };
}

async function queryJobs(access: AuthAccess, filters: HrFilters): Promise<HrQueryResult> {
  const params: unknown[] = [];
  const scope = await jobsScopeSql(access, params, "j");
  const where: string[] = [scope];

  if (filters.search_text?.trim()) {
    params.push(`%${filters.search_text.trim()}%`);
    const i = params.length;
    where.push(`(j.title ILIKE $${i} OR j.company ILIKE $${i} OR j.location ILIKE $${i} OR COALESCE(j.description,'') ILIKE $${i})`);
  }
  if (filters.location?.trim()) {
    params.push(`%${filters.location.trim()}%`);
    where.push(`j.location ILIKE $${params.length}`);
  }
  if (filters.job_status?.trim()) {
    params.push(`%${filters.job_status.trim()}%`);
    where.push(`j.status ILIKE $${params.length}`);
  }
  if (typeof filters.job_id === "number" && filters.job_id > 0) {
    params.push(filters.job_id);
    where.push(`j.id = $${params.length}`);
  }
  await addJobSkillFilters(filters, params, where);
  addDateRange(filters, params, where, "j.created_at");

  const { sql: colSql, columns } = await jobsSelectColumns();
  const sql = `
    SELECT ${colSql}
    FROM jobs j
    WHERE ${where.join(" AND ")}
    ORDER BY j.updated_at DESC NULLS LAST
    LIMIT ${MAX_ROWS}
  `;
  const res = await query(sql, params);
  return {
    entity: "jobs",
    columns,
    rows: res.rows as Record<string, unknown>[],
  };
}

async function queryApplications(
  access: AuthAccess,
  filters: HrFilters,
  interviewsOnly: boolean
): Promise<HrQueryResult> {
  const params: unknown[] = [];
  const scope = await applicationsScopeSql(access, params);
  const where: string[] = [scope];

  if (interviewsOnly) {
    where.push(
      `(a.interview_datetime IS NOT NULL OR a.stage = 'Interview' OR a.interview_scheduled IS TRUE)`
    );
  }

  // Do not apply LLM stage filters on interview listings — they often send "Applied" and zero out results.
  if (!interviewsOnly && filters.stage?.trim()) {
    const st = filters.stage.trim();
    if (isStage(st)) {
      params.push(st);
      where.push(`a.stage = $${params.length}`);
    } else {
      params.push(`%${st}%`);
      where.push(`a.stage ILIKE $${params.length}`);
    }
  }

  if (filters.search_text?.trim()) {
    params.push(`%${filters.search_text.trim()}%`);
    const i = params.length;
    where.push(`(c.full_name ILIKE $${i} OR j.title ILIKE $${i})`);
  }
  if (typeof filters.job_id === "number" && filters.job_id > 0) {
    params.push(filters.job_id);
    where.push(`a.job_id = $${params.length}`);
  }
  if (typeof filters.candidate_id === "number" && filters.candidate_id > 0) {
    params.push(filters.candidate_id);
    where.push(`a.candidate_id = $${params.length}`);
  }
  if (typeof filters.application_id === "number" && filters.application_id > 0) {
    params.push(filters.application_id);
    where.push(`a.id = $${params.length}`);
  }
  if (interviewsOnly && (filters.date_from || filters.date_to)) {
    addInterviewCalendarWindow(filters, params, where);
  } else {
    // For Selected-stage queries, "this week" should reflect stage transition timing.
    // We use updated_at because stage updates are persisted there.
    const dateColumn = isSelectedStage(filters.stage) ? "a.updated_at" : "a.created_at";
    addDateRange(filters, params, where, dateColumn);
  }

  const orderSql = interviewsOnly
    ? "a.interview_datetime DESC NULLS LAST, a.updated_at DESC NULLS LAST"
    : "a.updated_at DESC NULLS LAST";

  const sql = `
    SELECT
      a.id AS application_id,
      a.stage,
      a.status AS application_status,
      COALESCE(a.source, '') AS application_source,
      a.interview_datetime,
      a.interview_scheduled,
      a.created_at,
      a.updated_at,
      c.id AS candidate_id,
      c.full_name AS candidate_name,
      j.id AS job_id,
      j.title AS job_title,
      u_ar.full_name AS assigned_recruiter_name,
      u_ar.email AS assigned_recruiter_email,
      u_cb.full_name AS created_by_name,
      u_cb.email AS created_by_email
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    LEFT JOIN users u_ar ON u_ar.id = a.assigned_recruiter_user_id
    LEFT JOIN users u_cb ON u_cb.id = a.created_by_user_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderSql}
    LIMIT ${MAX_ROWS}
  `;
  const res = await query(sql, params);
  return {
    entity: interviewsOnly ? "interviews" : "applications",
    columns: [
      "application_id",
      "stage",
      "application_status",
      "application_source",
      "interview_datetime",
      "interview_scheduled",
      "created_at",
      "updated_at",
      "candidate_id",
      "candidate_name",
      "job_id",
      "job_title",
      "assigned_recruiter_name",
      "assigned_recruiter_email",
      "created_by_name",
      "created_by_email",
    ],
    rows: res.rows as Record<string, unknown>[],
  };
}

async function queryOffers(access: AuthAccess, filters: HrFilters): Promise<HrQueryResult> {
  const f = { ...filters, stage: "Selected" };
  return queryApplications(access, f, false);
}

async function runBoardTotals(access: AuthAccess): Promise<HrQueryResult> {
  const rows: { board: string; count: number }[] = [];

  if (canViewBoard(access, "candidates.view")) {
    const params: unknown[] = [];
    const w = candidatesScopeSql(access, params, "c");
    const r = await query(`SELECT COUNT(*)::int AS c FROM candidates c WHERE ${w}`, params);
    rows.push({ board: "Candidates", count: Number((r.rows[0] as { c: number })?.c ?? 0) });
  }

  if (canViewBoard(access, "jobs.view")) {
    const params: unknown[] = [];
    const w = await jobsScopeSql(access, params, "j");
    const r = await query(`SELECT COUNT(*)::int AS c FROM jobs j WHERE ${w}`, params);
    rows.push({ board: "Jobs (requisitions)", count: Number((r.rows[0] as { c: number })?.c ?? 0) });
  }

  if (canViewBoard(access, "pipeline.view")) {
    const params: unknown[] = [];
    const w = await applicationsScopeSql(access, params);
    const r = await query(`SELECT COUNT(*)::int AS c FROM applications a WHERE ${w}`, params);
    rows.push({ board: "Applications (pipeline)", count: Number((r.rows[0] as { c: number })?.c ?? 0) });
  }

  if (canViewBoard(access, "interviews.view")) {
    const params: unknown[] = [];
    const w = await applicationsScopeSql(access, params);
    const r = await query(
      `SELECT COUNT(*)::int AS c FROM applications a WHERE ${w} AND (a.interview_datetime IS NOT NULL OR a.stage = 'Interview' OR a.interview_scheduled = true)`,
      params
    );
    rows.push({ board: "Interview queue", count: Number((r.rows[0] as { c: number })?.c ?? 0) });
  }

  if (canViewBoard(access, "vendors.view")) {
    const r = await query(`SELECT COUNT(*)::int AS c FROM vendors WHERE created_by_user_id = $1`, [access.user_id]);
    rows.push({ board: "Vendors", count: Number((r.rows[0] as { c: number })?.c ?? 0) });
  }

  return {
    entity: "analytics",
    columns: ["board", "count"],
    rows: rows as unknown as Record<string, unknown>[],
  };
}

async function verifyApplicationsCountStrict(input: {
  where: string[];
  params: unknown[];
  countValue: number;
  definitionUsed: string;
}): Promise<HrVerificationMeta> {
  const timezone = getHrAssistantReportingTimezone();
  const idSql = `
    SELECT a.id::int AS application_id
    FROM applications a
    WHERE ${input.where.join(" AND ")}
    ORDER BY a.updated_at DESC NULLS LAST
    LIMIT 500
  `;
  const idRes = await query(idSql, input.params);
  const ids = (idRes.rows as Array<{ application_id: number }>).map((r) => Number(r.application_id)).filter(Number.isFinite);
  if (ids.length === input.countValue) {
    return {
      verified: true,
      definition_used: input.definitionUsed,
      timezone_used: timezone,
      query_variant: "count_plus_id_set_v1",
      sample_ids: ids.slice(0, 10),
    };
  }

  const distinctCountSql = `SELECT COUNT(DISTINCT a.id)::int AS total FROM applications a WHERE ${input.where.join(" AND ")}`;
  const fallbackRes = await query(distinctCountSql, input.params);
  const fallbackTotal = Number((fallbackRes.rows?.[0] as { total?: number } | undefined)?.total ?? 0);
  const fallbackOk = fallbackTotal === ids.length;
  return {
    verified: fallbackOk,
    definition_used: input.definitionUsed,
    timezone_used: timezone,
    query_variant: fallbackOk ? "distinct_count_plus_id_set_v2" : "count_mismatch_exposed",
    sample_ids: ids.slice(0, 10),
    warning: fallbackOk
      ? undefined
      : `Verification mismatch: count=${input.countValue}, ids=${ids.length}, distinct_count=${fallbackTotal}.`,
  };
}

async function runAnalytics(access: AuthAccess, plan: HrAssistantPlan): Promise<HrQueryResult> {
  const metric = plan.analytics?.metric ?? "count";
  const filters = plan.filters ?? {};

  if (metric === "board_totals") {
    return runBoardTotals(access);
  }

  if (metric === "group_by_stage") {
    const params: unknown[] = [];
    const scope = await applicationsScopeSql(access, params);
    const where: string[] = [scope];
    if (filters.date_from) {
      params.push(filters.date_from);
      where.push(`a.updated_at >= $${params.length}::timestamptz`);
    }
    if (filters.date_to) {
      params.push(filters.date_to);
      where.push(`a.updated_at <= $${params.length}::timestamptz`);
    }
    const sql = `
      SELECT a.stage, COUNT(*)::int AS count
      FROM applications a
      WHERE ${where.join(" AND ")}
      GROUP BY a.stage
      ORDER BY count DESC
    `;
    const res = await query(sql, params);
    return {
      entity: "analytics",
      columns: ["stage", "count"],
      rows: res.rows as Record<string, unknown>[],
    };
  }

  if (metric === "trend_weekly_applications") {
    const params: unknown[] = [];
    const scope = await applicationsScopeSql(access, params);
    const where: string[] = [scope];
    if (filters.date_from) {
      params.push(filters.date_from);
      where.push(`a.created_at >= $${params.length}::timestamptz`);
    }
    if (filters.date_to) {
      params.push(filters.date_to);
      where.push(`a.created_at <= $${params.length}::timestamptz`);
    }
    const sql = `
      SELECT date_trunc('week', a.created_at AT TIME ZONE 'UTC')::date AS week_start,
             COUNT(*)::int AS applications_count
      FROM applications a
      WHERE ${where.join(" AND ")}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 24
    `;
    const res = await query(sql, params);
    return {
      entity: "analytics",
      columns: ["week_start", "applications_count"],
      rows: res.rows as Record<string, unknown>[],
    };
  }

  const target = plan.entity === "candidates" ? "candidates" : plan.entity === "jobs" ? "jobs" : "applications";

  if (target === "candidates") {
    const params: unknown[] = [];
    const where = [candidatesScopeSql(access, params, "c")];
    await addCandidateSkillFilters(filters, params, where);
    if (filters.location?.trim()) {
      params.push(`%${filters.location.trim()}%`);
      where.push(`c.location ILIKE $${params.length}`);
    }
    const sql = `SELECT COUNT(*)::int AS total FROM candidates c WHERE ${where.join(" AND ")}`;
    const res = await query(sql, params);
    const total = (res.rows[0] as { total: number })?.total ?? 0;
    return { entity: "analytics", columns: ["metric", "total"], rows: [{ metric: "candidates", total }] };
  }

  if (target === "jobs") {
    const params: unknown[] = [];
    const scope = await jobsScopeSql(access, params, "j");
    const where: string[] = [scope];
    if (filters.job_status?.trim()) {
      params.push(`%${filters.job_status.trim()}%`);
      where.push(`j.status ILIKE $${params.length}`);
    }
    await addJobSkillFilters(filters, params, where);
    const sql = `SELECT COUNT(*)::int AS total FROM jobs j WHERE ${where.join(" AND ")}`;
    const res = await query(sql, params);
    const total = (res.rows[0] as { total: number })?.total ?? 0;
    return { entity: "analytics", columns: ["metric", "total"], rows: [{ metric: "jobs", total }] };
  }

  const params: unknown[] = [];
  const scope = await applicationsScopeSql(access, params);
  const where: string[] = [scope];
  if (filters.stage?.trim() && isStage(filters.stage.trim())) {
    params.push(filters.stage.trim());
    where.push(`a.stage = $${params.length}`);
  }
  // For Selected-stage counts, use updated_at so "selected this week" matches pipeline moves.
  const analyticsDateColumn = isSelectedStage(filters.stage) ? "a.updated_at" : "a.created_at";
  if (filters.date_from) {
    params.push(filters.date_from);
    where.push(`${analyticsDateColumn} >= $${params.length}::timestamptz`);
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    where.push(`${analyticsDateColumn} <= $${params.length}::timestamptz`);
  }
  const sql = `SELECT COUNT(*)::int AS total FROM applications a WHERE ${where.join(" AND ")}`;
  const res = await query(sql, params);
  const total = (res.rows[0] as { total: number })?.total ?? 0;
  const definitionUsed = isSelectedStage(filters.stage)
    ? "Selected stage based on applications.updated_at"
    : "Applications count based on applications.created_at (or stage filter)";
  const verification = isStrictCriticalCount(plan)
    ? await verifyApplicationsCountStrict({
        where,
        params,
        countValue: total,
        definitionUsed,
      })
    : undefined;
  return {
    entity: "analytics",
    columns: ["metric", "total"],
    rows: [{ metric: "applications", total }],
    verification,
  };
}
