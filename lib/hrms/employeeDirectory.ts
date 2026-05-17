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
      OR COALESCE(${hasEmployeeCode ? "u.employee_code" : "''"}, '') ILIKE $${idx}
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
  const buildSql = (withEmployeeCode: boolean) => `
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
  let res;
  try {
    res = await query(
      buildSql(hasEmployeeCode),
      values,
    );
  } catch (error) {
    if (!hasEmployeeCode || !isMissingEmployeeCodeError(error)) throw error;
    invalidateEmployeeCodeCache();
    hasEmployeeCode = false;
    res = await query(buildSql(false), values);
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
  const hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const managerId = await resolveReportingManagerUserId(
        row.reportingManagerUserId || null,
        row.reportingManagerEmail || null,
      );
      await client.query(
        `
          INSERT INTO users
          (${hasEmployeeCode ? "employee_code," : ""} full_name, email, phone, department, designation, employment_type, joining_date, reporting_manager_user_id, work_location, employment_status, role)
          VALUES (${hasEmployeeCode ? "$1," : ""} ${hasEmployeeCode ? "$2" : "$1"}, ${hasEmployeeCode ? "$3" : "$2"}, ${hasEmployeeCode ? "$4" : "$3"}, ${hasEmployeeCode ? "$5" : "$4"}, ${hasEmployeeCode ? "$6" : "$5"}, ${hasEmployeeCode ? "$7" : "$6"}, ${hasEmployeeCode ? "$8" : "$7"}::date, ${hasEmployeeCode ? "$9" : "$8"}, ${hasEmployeeCode ? "$10" : "$9"}, ${hasEmployeeCode ? "$11" : "$10"}, ${hasEmployeeCode ? "$12" : "$11"})
        `,
        hasEmployeeCode
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
      );
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
  const hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const normalizedStatus = normalizeEmployeeStatus(input.status);
  const role = (input.role || "employee").trim().toLowerCase();
  const managerId = await resolveReportingManagerUserId(input.reportingManagerUserId || null, input.reportingManagerEmail || null);
  const ins = await query(
    `
      INSERT INTO users
      (${hasEmployeeCode ? "employee_code," : ""} full_name, email, phone, department, designation, employment_type, joining_date, reporting_manager_user_id, work_location, employment_status, role)
      VALUES (${hasEmployeeCode ? "$1," : ""} ${hasEmployeeCode ? "$2" : "$1"}, ${hasEmployeeCode ? "$3" : "$2"}, ${hasEmployeeCode ? "$4" : "$3"}, ${hasEmployeeCode ? "$5" : "$4"}, ${hasEmployeeCode ? "$6" : "$5"}, ${hasEmployeeCode ? "$7" : "$6"}, ${hasEmployeeCode ? "$8" : "$7"}::date, ${hasEmployeeCode ? "$9" : "$8"}, ${hasEmployeeCode ? "$10" : "$9"}, ${hasEmployeeCode ? "$11" : "$10"}, ${hasEmployeeCode ? "$12" : "$11"})
      RETURNING id
    `,
    hasEmployeeCode
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
  );
  const id = Number(ins.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId,
    action: "hrms.employee.created",
    metadata: { employee_id: id, email: input.email },
  });
  return id;
}

export async function updateEmployee(id: number, input: EmployeeDirectoryInput, actorUserId: number) {
  const hasEmployeeCode = await hasUsersEmployeeCodeColumn();
  const normalizedStatus = normalizeEmployeeStatus(input.status);
  const managerId = await resolveReportingManagerUserId(input.reportingManagerUserId || null, input.reportingManagerEmail || null);
  await query(
    `
      UPDATE users
      SET
        ${hasEmployeeCode ? "employee_code = $2," : ""}
        full_name = ${hasEmployeeCode ? "$3" : "$2"},
        email = ${hasEmployeeCode ? "$4" : "$3"},
        phone = ${hasEmployeeCode ? "$5" : "$4"},
        department = ${hasEmployeeCode ? "$6" : "$5"},
        designation = ${hasEmployeeCode ? "$7" : "$6"},
        employment_type = ${hasEmployeeCode ? "$8" : "$7"},
        joining_date = ${hasEmployeeCode ? "$9" : "$8"}::date,
        reporting_manager_user_id = ${hasEmployeeCode ? "$10" : "$9"},
        work_location = ${hasEmployeeCode ? "$11" : "$10"},
        employment_status = ${hasEmployeeCode ? "$12" : "$11"},
        role = ${hasEmployeeCode ? "$13" : "$12"}
      WHERE id = $1
    `,
    hasEmployeeCode
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
  );
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
