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
      OR COALESCE(u.employee_code, '') ILIKE $${idx}
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
  const res = await query(
    `
      SELECT
        u.id,
        COALESCE(u.employee_code, '') AS employee_code,
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
        COALESCE(m.full_name, '') AS reporting_manager_name
      FROM users u
      LEFT JOIN users m ON m.id = u.reporting_manager_user_id
      ${whereSql}
      ORDER BY LOWER(u.full_name) ASC, u.id ASC
    `,
    values,
  );
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
  const valid = results.filter((item) => item.status === "valid" && item.normalized);
  if (valid.length === 0) return results;

  const existing = await query(
    `
      SELECT LOWER(email) AS email, LOWER(COALESCE(employee_code, '')) AS employee_code
      FROM users
      WHERE LOWER(email) = ANY($1::text[]) OR LOWER(COALESCE(employee_code, '')) = ANY($2::text[])
    `,
    [
      valid.map((item) => String(item.normalized?.email || "").toLowerCase()),
      valid.map((item) => String(item.normalized?.employeeIdCode || "").toLowerCase()),
    ],
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
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      await client.query(
        `
          INSERT INTO users
          (employee_code, full_name, email, phone, department, designation, employment_type, joining_date, reporting_manager_user_id, work_location, employment_status, role)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12)
        `,
        [
          row.employeeIdCode,
          row.fullName,
          row.email,
          row.phone,
          row.department,
          row.designation,
          row.employmentType,
          row.joiningDate,
          row.reportingManagerUserId || null,
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
  const normalizedStatus = normalizeEmployeeStatus(input.status);
  const role = (input.role || "employee").trim().toLowerCase();
  const ins = await query(
    `
      INSERT INTO users
      (employee_code, full_name, email, phone, department, designation, employment_type, joining_date, reporting_manager_user_id, work_location, employment_status, role)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12)
      RETURNING id
    `,
    [
      input.employeeIdCode.trim(),
      input.fullName.trim(),
      input.email.trim().toLowerCase(),
      input.phone?.trim() || null,
      input.department?.trim() || null,
      input.designation?.trim() || null,
      input.employmentType?.trim() || null,
      input.joiningDate || null,
      input.reportingManagerUserId || null,
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
  const normalizedStatus = normalizeEmployeeStatus(input.status);
  await query(
    `
      UPDATE users
      SET
        employee_code = $2,
        full_name = $3,
        email = $4,
        phone = $5,
        department = $6,
        designation = $7,
        employment_type = $8,
        joining_date = $9::date,
        reporting_manager_user_id = $10,
        work_location = $11,
        employment_status = $12,
        role = $13
      WHERE id = $1
    `,
    [
      id,
      input.employeeIdCode.trim(),
      input.fullName.trim(),
      input.email.trim().toLowerCase(),
      input.phone?.trim() || null,
      input.department?.trim() || null,
      input.designation?.trim() || null,
      input.employmentType?.trim() || null,
      input.joiningDate || null,
      input.reportingManagerUserId || null,
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
