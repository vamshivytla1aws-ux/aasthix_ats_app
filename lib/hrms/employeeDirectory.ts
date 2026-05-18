import { pool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export type EmployeeStatus = "active" | "inactive" | "resigned";

export type EmployeeDirectoryInput = {
  employeeIdCode: string;
  fullName: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  employmentType?: string | null;
  joiningDate?: string | null;
  reportingManagerUserId?: number | null;
  reportingManagerEmail?: string | null;
  workLocation?: string | null;
  status: EmployeeStatus;
  role?: string | null;
};

export type EmployeeImportRow = EmployeeDirectoryInput & {
  rowNumber: number;
};

export type EmployeeImportRowResult = {
  rowNumber: number;
  status: "valid" | "invalid" | "conflict";
  message: string;
  normalized?: EmployeeDirectoryInput;
};

const COMPLETENESS_FIELDS = [
  "employee_code",
  "email",
  "phone",
  "department",
  "designation",
  "joining_date",
  "reporting_manager_user_id",
  "work_location",
  "employment_status",
] as const;

async function resolveReportingManagerUserId(
  managerUserId: number | null | undefined,
  managerEmail: string | null | undefined,
) {
  if (managerUserId && Number.isFinite(Number(managerUserId))) {
    const res = await query(
      `
        SELECT id
        FROM users
        WHERE id = $1
          AND COALESCE(employment_status, 'active') = 'active'
        LIMIT 1
      `,
      [Number(managerUserId)],
    );
    if (res.rowCount === 0) return null;
    return Number(res.rows[0].id);
  }

  const email = String(managerEmail || "").trim().toLowerCase();
  if (email) {
    const res = await query(
      `
        SELECT id
        FROM users
        WHERE LOWER(email) = $1
          AND COALESCE(employment_status, 'active') = 'active'
        LIMIT 1
      `,
      [email],
    );
    if (res.rowCount === 0) return null;
    return Number(res.rows[0].id);
  }

  return null;
}

async function requireResolvableReportingManager(
  managerUserId: number | null | undefined,
  managerEmail: string | null | undefined,
) {
  const hasUserId = Boolean(managerUserId && Number.isFinite(Number(managerUserId)));
  const hasEmail = Boolean(String(managerEmail || "").trim());
  if (!hasUserId && !hasEmail) return null;
  const managerId = await resolveReportingManagerUserId(managerUserId, managerEmail);
  if (managerId) return managerId;
  const error = new Error("Reporting manager email/user was not found as an active employee.");
  (error as Error & { code?: string }).code = "MANAGER_NOT_FOUND";
  throw error;
}

let hasEmployeeCodeColumnCache: boolean | null = null;

async function hasUsersEmployeeCodeColumn() {
  // Re-check periodically so long-lived processes do not hold stale schema capability state.
  if (hasEmployeeCodeColumnCache != null) return hasEmployeeCodeColumnCache;
  const res = await query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'employee_code'
      LIMIT 1
    `,
    [],
  );
  hasEmployeeCodeColumnCache = res.rowCount > 0;
  return hasEmployeeCodeColumnCache;
}

function isMissingEmployeeCodeError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return code === "42703" && /employee_code/i.test(message);
}

function invalidateEmployeeCodeCache() {
  hasEmployeeCodeColumnCache = null;
}

export function normalizeEmployeeStatus(value: string): EmployeeStatus {
  const v = (value || "").trim().toLowerCase();
  if (v === "inactive") return "inactive";
  if (v === "resigned") return "resigned";
  return "active";
}

export async function listEmployees(params: {
  actorUserId: number;
  role: string;
  q?: string;
  department?: string;
  status?: string;
}) {
  let hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const buildQuery = (withEmployeeCode: boolean) => {
    const where: string[] = [];
    const values: Array<string | number> = [];
    let idx = 1;

    if (params.role === "employee") {
      where.push(`u.id = $${idx++}`);
      values.push(params.actorUserId);
    } else if (params.role === "hiring_manager" || params.role === "manager") {
      where.push(`u.reporting_manager_user_id = $${idx++}`);
      values.push(params.actorUserId);
    }

    if (params.q && params.q.trim()) {
      where.push(`(
        u.full_name ILIKE $${idx}
        OR u.email ILIKE $${idx}
        OR COALESCE(${withEmployeeCode ? "u.employee_code" : "''"}, '') ILIKE $${idx}
        OR COALESCE(u.phone, '') ILIKE $${idx}
      )`);
      values.push(`%${params.q.trim()}%`);
      idx += 1;
    }

    if (params.department && params.department.trim()) {
      where.push(`COALESCE(u.department, '') ILIKE $${idx++}`);
      values.push(params.department.trim());
    }

    if (params.status && params.status.trim()) {
      where.push(`u.employment_status = $${idx++}`);
      values.push(normalizeEmployeeStatus(params.status));
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT
        u.id,
        ${withEmployeeCode ? "COALESCE(u.employee_code, '')" : "''"} AS employee_code,
        u.full_name,
        u.email,
        COALESCE(u.phone, '') AS phone,
        COALESCE(u.department, '') AS department,
        COALESCE(u.role, 'user') AS role,
        COALESCE(u.designation, '') AS designation,
        COALESCE(u.employment_type, '') AS employment_type,
        u.joining_date,
        COALESCE(u.work_location, '') AS work_location,
        COALESCE(u.employment_status, 'active') AS employment_status,
        u.reporting_manager_user_id,
        COALESCE(m.full_name, '') AS reporting_manager_name,
        COALESCE(m.email, '') AS reporting_manager_email
      FROM users u
      LEFT JOIN users m ON m.id = u.reporting_manager_user_id
      ${whereSql}
      ORDER BY LOWER(u.full_name) ASC, u.id ASC
    `;
    return { sql, values };
  };
  let res;
  try {
    const q = buildQuery(hasEmployeeCode);
    res = await query(q.sql, q.values);
  } catch (error) {
    if (!hasEmployeeCode || !isMissingEmployeeCodeError(error)) throw error;
    invalidateEmployeeCodeCache();
    hasEmployeeCode = false;
    const q = buildQuery(false);
    res = await query(q.sql, q.values);
  }
  return res.rows.map((row: Record<string, unknown>) => {
    const filled = COMPLETENESS_FIELDS.reduce((acc, key) => {
      const value = row[key];
      const present = value !== null && value !== undefined && String(value).trim() !== "";
      return acc + (present ? 1 : 0);
    }, 0);
    const completenessPercent = Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
    return {
      ...row,
      profile_completeness: completenessPercent,
    };
  });
}

function normalizeEmployeeInput(input: Partial<EmployeeDirectoryInput>): EmployeeDirectoryInput {
  return {
    employeeIdCode: String(input.employeeIdCode || "").trim(),
    fullName: String(input.fullName || "").trim(),
    email: String(input.email || "").trim().toLowerCase(),
    phone: (input.phone || "").trim() || null,
    department: (input.department || "").trim() || null,
    designation: (input.designation || "").trim() || null,
    employmentType: (input.employmentType || "").trim() || null,
    joiningDate: input.joiningDate || null,
    reportingManagerUserId: input.reportingManagerUserId || null,
    reportingManagerEmail: (input.reportingManagerEmail || "").trim() || null,
    workLocation: (input.workLocation || "").trim() || null,
    status: normalizeEmployeeStatus(String(input.status || "active")),
    role: (input.role || "employee").trim().toLowerCase(),
  };
}

export function validateImportRows(rows: EmployeeImportRow[]) {
  const results: EmployeeImportRowResult[] = [];
  for (const row of rows) {
    const normalized = normalizeEmployeeInput(row);
    if (!normalized.employeeIdCode || !normalized.fullName || !normalized.email) {
      results.push({
        rowNumber: row.rowNumber,
        status: "invalid",
        message: "employeeIdCode, fullName, and email are required.",
      });
      continue;
    }
    results.push({
      rowNumber: row.rowNumber,
      status: "valid",
      message: "Ready to import",
      normalized,
    });
  }
  return results;
}

export async function applyImportConflictChecks(results: EmployeeImportRowResult[]) {
  const hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const valid = results.filter((item) => item.status === "valid" && item.normalized);
  if (valid.length === 0) return results;

  const existing = hasEmployeeCode
    ? await query(
        `
          SELECT LOWER(email) AS email, LOWER(COALESCE(employee_code, '')) AS employee_code
          FROM users
          WHERE LOWER(email) = ANY($1::text[]) OR LOWER(COALESCE(employee_code, '')) = ANY($2::text[])
        `,
        [
          valid.map((item) => String(item.normalized?.email || "").toLowerCase()),
          valid.map((item) => String(item.normalized?.employeeIdCode || "").toLowerCase()),
        ],
      ).catch(async (error: unknown) => {
        if (!isMissingEmployeeCodeError(error)) throw error;
        invalidateEmployeeCodeCache();
        return query(
          `
            SELECT LOWER(email) AS email, ''::text AS employee_code
            FROM users
            WHERE LOWER(email) = ANY($1::text[])
          `,
          [valid.map((item) => String(item.normalized?.email || "").toLowerCase())],
        );
      })
    : await query(
        `
          SELECT LOWER(email) AS email, ''::text AS employee_code
          FROM users
          WHERE LOWER(email) = ANY($1::text[])
        `,
        [valid.map((item) => String(item.normalized?.email || "").toLowerCase())],
      );
  const existingEmails = new Set(existing.rows.map((row: { email?: unknown }) => String(row.email || "")));
  const existingCodes = new Set(existing.rows.map((row: { employee_code?: unknown }) => String(row.employee_code || "")));

  const seenEmails = new Set<string>();
  const seenCodes = new Set<string>();

  return results.map((item) => {
    if (item.status !== "valid" || !item.normalized) return item;
    const email = item.normalized.email.toLowerCase();
    const code = item.normalized.employeeIdCode.toLowerCase();

    if (existingEmails.has(email)) {
      return { ...item, status: "conflict", message: "Email already exists." };
    }
    if (existingCodes.has(code)) {
      return { ...item, status: "conflict", message: "Employee code already exists." };
    }
    if (seenEmails.has(email)) {
      return { ...item, status: "conflict", message: "Duplicate email in CSV file." };
    }
    if (seenCodes.has(code)) {
      return { ...item, status: "conflict", message: "Duplicate employee code in CSV file." };
    }
    seenEmails.add(email);
    seenCodes.add(code);
    return item;
  });
}

export async function importEmployees(rows: EmployeeDirectoryInput[], actorUserId: number) {
  if (rows.length === 0) return { created: 0 };
  let hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const managerId = await requireResolvableReportingManager(
        row.reportingManagerUserId || null,
        row.reportingManagerEmail || null,
      );
      const buildInsert = (withEmployeeCode: boolean) => ({
        sql: `
          INSERT INTO users
          (${withEmployeeCode ? "employee_code," : ""} full_name, email, phone, department, designation, employment_type, joining_date, reporting_manager_user_id, work_location, employment_status, role)
          VALUES (${withEmployeeCode ? "$1," : ""} ${withEmployeeCode ? "$2" : "$1"}, ${withEmployeeCode ? "$3" : "$2"}, ${withEmployeeCode ? "$4" : "$3"}, ${withEmployeeCode ? "$5" : "$4"}, ${withEmployeeCode ? "$6" : "$5"}, ${withEmployeeCode ? "$7" : "$6"}, ${withEmployeeCode ? "$8" : "$7"}::date, ${withEmployeeCode ? "$9" : "$8"}, ${withEmployeeCode ? "$10" : "$9"}, ${withEmployeeCode ? "$11" : "$10"}, ${withEmployeeCode ? "$12" : "$11"})
        `,
        values: withEmployeeCode
          ? [
              row.employeeIdCode,
              row.fullName,
              row.email,
              row.phone,
              row.department,
              row.designation,
              row.employmentType,
              row.joiningDate,
              managerId,
              row.workLocation,
              normalizeEmployeeStatus(row.status),
              (row.role || "employee").toLowerCase(),
            ]
          : [
              row.fullName,
              row.email,
              row.phone,
              row.department,
              row.designation,
              row.employmentType,
              row.joiningDate,
              managerId,
              row.workLocation,
              normalizeEmployeeStatus(row.status),
              (row.role || "employee").toLowerCase(),
            ],
      });
      try {
        const ins = buildInsert(hasEmployeeCode);
        await client.query(ins.sql, ins.values);
      } catch (error) {
        if (!hasEmployeeCode || !isMissingEmployeeCodeError(error)) throw error;
        invalidateEmployeeCodeCache();
        hasEmployeeCode = false;
        const ins = buildInsert(false);
        await client.query(ins.sql, ins.values);
      }
      created += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await writeAuditLog({
    actorUserId,
    action: "hrms.employee.bulk_imported",
    metadata: { created_count: created },
  });

  return { created };
}

export async function createEmployee(input: EmployeeDirectoryInput, actorUserId: number) {
  let hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const normalizedStatus = normalizeEmployeeStatus(input.status);
  const role = (input.role || "employee").trim().toLowerCase();
  const managerId = await requireResolvableReportingManager(input.reportingManagerUserId || null, input.reportingManagerEmail || null);
  const buildInsert = (withEmployeeCode: boolean) => ({
    sql: `
      INSERT INTO users
      (${withEmployeeCode ? "employee_code," : ""} full_name, email, phone, department, designation, employment_type, joining_date, reporting_manager_user_id, work_location, employment_status, role)
      VALUES (${withEmployeeCode ? "$1," : ""} ${withEmployeeCode ? "$2" : "$1"}, ${withEmployeeCode ? "$3" : "$2"}, ${withEmployeeCode ? "$4" : "$3"}, ${withEmployeeCode ? "$5" : "$4"}, ${withEmployeeCode ? "$6" : "$5"}, ${withEmployeeCode ? "$7" : "$6"}, ${withEmployeeCode ? "$8" : "$7"}::date, ${withEmployeeCode ? "$9" : "$8"}, ${withEmployeeCode ? "$10" : "$9"}, ${withEmployeeCode ? "$11" : "$10"}, ${withEmployeeCode ? "$12" : "$11"})
      RETURNING id
    `,
    values: withEmployeeCode
      ? [
          input.employeeIdCode.trim(),
          input.fullName.trim(),
          input.email.trim().toLowerCase(),
          input.phone?.trim() || null,
          input.department?.trim() || null,
          input.designation?.trim() || null,
          input.employmentType?.trim() || null,
          input.joiningDate || null,
          managerId,
          input.workLocation?.trim() || null,
          normalizedStatus,
          role,
        ]
      : [
          input.fullName.trim(),
          input.email.trim().toLowerCase(),
          input.phone?.trim() || null,
          input.department?.trim() || null,
          input.designation?.trim() || null,
          input.employmentType?.trim() || null,
          input.joiningDate || null,
          managerId,
          input.workLocation?.trim() || null,
          normalizedStatus,
          role,
        ],
  });
  let ins;
  try {
    const q = buildInsert(hasEmployeeCode);
    ins = await query(q.sql, q.values);
  } catch (error) {
    if (!hasEmployeeCode || !isMissingEmployeeCodeError(error)) throw error;
    invalidateEmployeeCodeCache();
    hasEmployeeCode = false;
    const q = buildInsert(false);
    ins = await query(q.sql, q.values);
  }
  const id = Number(ins.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId,
    action: "hrms.employee.created",
    metadata: { employee_id: id, email: input.email },
  });
  return id;
}

export async function updateEmployee(id: number, input: EmployeeDirectoryInput, actorUserId: number) {
  let hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const normalizedStatus = normalizeEmployeeStatus(input.status);
  const managerId = await requireResolvableReportingManager(input.reportingManagerUserId || null, input.reportingManagerEmail || null);
  const buildUpdate = (withEmployeeCode: boolean) => ({
    sql: `
      UPDATE users
      SET
        ${withEmployeeCode ? "employee_code = $2," : ""}
        full_name = ${withEmployeeCode ? "$3" : "$2"},
        email = ${withEmployeeCode ? "$4" : "$3"},
        phone = ${withEmployeeCode ? "$5" : "$4"},
        department = ${withEmployeeCode ? "$6" : "$5"},
        designation = ${withEmployeeCode ? "$7" : "$6"},
        employment_type = ${withEmployeeCode ? "$8" : "$7"},
        joining_date = ${withEmployeeCode ? "$9" : "$8"}::date,
        reporting_manager_user_id = ${withEmployeeCode ? "$10" : "$9"},
        work_location = ${withEmployeeCode ? "$11" : "$10"},
        employment_status = ${withEmployeeCode ? "$12" : "$11"},
        role = ${withEmployeeCode ? "$13" : "$12"}
      WHERE id = $1
    `,
    values: withEmployeeCode
      ? [
          id,
          input.employeeIdCode.trim(),
          input.fullName.trim(),
          input.email.trim().toLowerCase(),
          input.phone?.trim() || null,
          input.department?.trim() || null,
          input.designation?.trim() || null,
          input.employmentType?.trim() || null,
          input.joiningDate || null,
          managerId,
          input.workLocation?.trim() || null,
          normalizedStatus,
          (input.role || "employee").trim().toLowerCase(),
        ]
      : [
          id,
          input.fullName.trim(),
          input.email.trim().toLowerCase(),
          input.phone?.trim() || null,
          input.department?.trim() || null,
          input.designation?.trim() || null,
          input.employmentType?.trim() || null,
          input.joiningDate || null,
          managerId,
          input.workLocation?.trim() || null,
          normalizedStatus,
          (input.role || "employee").trim().toLowerCase(),
        ],
  });
  try {
    const q = buildUpdate(hasEmployeeCode);
    await query(q.sql, q.values);
  } catch (error) {
    if (!hasEmployeeCode || !isMissingEmployeeCodeError(error)) throw error;
    invalidateEmployeeCodeCache();
    hasEmployeeCode = false;
    const q = buildUpdate(false);
    await query(q.sql, q.values);
  }
  await writeAuditLog({
    actorUserId,
    action: "hrms.employee.updated",
    metadata: { employee_id: id, status: normalizedStatus },
  });
}

export async function deactivateEmployee(id: number, actorUserId: number) {
  await query(
    `UPDATE users SET employment_status = 'inactive' WHERE id = $1`,
    [id],
  );
  await writeAuditLog({
    actorUserId,
    action: "hrms.employee.deactivated",
    metadata: { employee_id: id },
  });
}
