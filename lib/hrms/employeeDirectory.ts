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

const USERS_COLUMN_CACHE_TTL_MS = 60_000;
const usersColumnCache = new Map<string, { exists: boolean; checkedAt: number }>();

async function hasUsersColumn(columnName: string) {
  const key = columnName.trim().toLowerCase();
  if (!key) return false;
  const cached = usersColumnCache.get(key);
  if (cached && Date.now() - cached.checkedAt < USERS_COLUMN_CACHE_TTL_MS) return cached.exists;
  const res = await query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = $1
      LIMIT 1
    `,
    [key],
  );
  const exists = res.rowCount > 0;
  usersColumnCache.set(key, { exists, checkedAt: Date.now() });
  return exists;
}

async function hasUsersColumns(columns: string[]) {
  const checks = await Promise.all(columns.map((column) => hasUsersColumn(column)));
  return columns.reduce<Record<string, boolean>>((acc, column, idx) => {
    acc[column] = checks[idx];
    return acc;
  }, {});
}

async function hasUsersEmployeeCodeColumn() {
  return hasUsersColumn("employee_code");
}

function isMissingEmployeeCodeError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return code === "42703" && /employee_code/i.test(message);
}

function invalidateEmployeeCodeCache() {
  usersColumnCache.delete("employee_code");
}

function extractMissingUsersColumn(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  if (code !== "42703") return null;
  const fromAlias = message.match(/column\s+u\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (fromAlias?.[1]) return fromAlias[1].toLowerCase();
  const fromQuoted = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
  return fromQuoted?.[1] ? fromQuoted[1].toLowerCase() : null;
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
  const getCaps = async () =>
    hasUsersColumns([
    "employee_code",
    "phone",
    "department",
    "role",
    "designation",
    "employment_type",
    "joining_date",
    "work_location",
    "employment_status",
    "reporting_manager_user_id",
  ]);
  const buildQuery = (caps: Record<string, boolean>) => {
    const where: string[] = [];
    const values: Array<string | number> = [];
    let idx = 1;

    if (params.role === "employee") {
      where.push(`u.id = $${idx++}`);
      values.push(params.actorUserId);
    } else if (params.role === "hiring_manager" || params.role === "manager") {
      if (caps.reporting_manager_user_id) {
        where.push(`u.reporting_manager_user_id = $${idx++}`);
        values.push(params.actorUserId);
      } else {
        where.push("1 = 0");
      }
    }

    if (params.q && params.q.trim()) {
      const qClauses = [`u.full_name ILIKE $${idx}`, `u.email ILIKE $${idx}`];
      if (caps.employee_code) qClauses.push(`COALESCE(u.employee_code, '') ILIKE $${idx}`);
      if (caps.phone) qClauses.push(`COALESCE(u.phone, '') ILIKE $${idx}`);
      where.push(`(
        ${qClauses.join("\n        OR ")}
      )`);
      values.push(`%${params.q.trim()}%`);
      idx += 1;
    }

    if (caps.department && params.department && params.department.trim()) {
      where.push(`COALESCE(u.department, '') ILIKE $${idx++}`);
      values.push(params.department.trim());
    }

    if (caps.employment_status && params.status && params.status.trim()) {
      where.push(`u.employment_status = $${idx++}`);
      values.push(normalizeEmployeeStatus(params.status));
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT
        u.id,
        ${caps.employee_code ? "COALESCE(u.employee_code, '')" : "''"} AS employee_code,
        u.full_name,
        u.email,
        ${caps.phone ? "COALESCE(u.phone, '')" : "''"} AS phone,
        ${caps.department ? "COALESCE(u.department, '')" : "''"} AS department,
        ${caps.role ? "COALESCE(u.role, 'user')" : "'user'"} AS role,
        ${caps.designation ? "COALESCE(u.designation, '')" : "''"} AS designation,
        ${caps.employment_type ? "COALESCE(u.employment_type, '')" : "''"} AS employment_type,
        ${caps.joining_date ? "u.joining_date" : "NULL::date"} AS joining_date,
        ${caps.work_location ? "COALESCE(u.work_location, '')" : "''"} AS work_location,
        ${caps.employment_status ? "COALESCE(u.employment_status, 'active')" : "'active'"} AS employment_status,
        ${caps.reporting_manager_user_id ? "u.reporting_manager_user_id" : "NULL::int"} AS reporting_manager_user_id,
        ${caps.reporting_manager_user_id ? "COALESCE(m.full_name, '')" : "''"} AS reporting_manager_name,
        ${caps.reporting_manager_user_id ? "COALESCE(m.email, '')" : "''"} AS reporting_manager_email
      FROM users u
      ${caps.reporting_manager_user_id ? "LEFT JOIN users m ON m.id = u.reporting_manager_user_id" : ""}
      ${whereSql}
      ORDER BY LOWER(u.full_name) ASC, u.id ASC
    `;
    return { sql, values };
  };
  let caps = await getCaps();
  let q = buildQuery(caps);
  let res;
  try {
    res = await query(q.sql, q.values);
  } catch (error) {
    const missingColumn = extractMissingUsersColumn(error);
    if (!missingColumn) throw error;
    usersColumnCache.set(missingColumn, { exists: false, checkedAt: Date.now() });
    if (missingColumn === "employee_code") invalidateEmployeeCodeCache();
    caps = await getCaps();
    q = buildQuery(caps);
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

export async function getEmployeeSelfProfile(userId: number) {
  const caps = await hasUsersColumns([
    "employee_code",
    "phone",
    "department",
    "role",
    "designation",
    "employment_type",
    "joining_date",
    "work_location",
    "employment_status",
    "reporting_manager_user_id",
  ]);

  const res = await query(
    `
      SELECT
        u.id,
        ${caps.employee_code ? "COALESCE(u.employee_code, '')" : "''"} AS employee_code,
        u.full_name,
        u.email,
        ${caps.phone ? "COALESCE(u.phone, '')" : "''"} AS phone,
        ${caps.department ? "COALESCE(u.department, '')" : "''"} AS department,
        ${caps.role ? "COALESCE(u.role, 'user')" : "'user'"} AS role,
        ${caps.designation ? "COALESCE(u.designation, '')" : "''"} AS designation,
        ${caps.employment_type ? "COALESCE(u.employment_type, '')" : "''"} AS employment_type,
        ${caps.joining_date ? "u.joining_date" : "NULL::date"} AS joining_date,
        ${caps.work_location ? "COALESCE(u.work_location, '')" : "''"} AS work_location,
        ${caps.employment_status ? "COALESCE(u.employment_status, 'active')" : "'active'"} AS employment_status,
        ${caps.reporting_manager_user_id ? "u.reporting_manager_user_id" : "NULL::int"} AS reporting_manager_user_id,
        ${caps.reporting_manager_user_id ? "COALESCE(m.full_name, '')" : "''"} AS reporting_manager_name,
        ${caps.reporting_manager_user_id ? "COALESCE(m.email, '')" : "''"} AS reporting_manager_email
      FROM users u
      ${caps.reporting_manager_user_id ? "LEFT JOIN users m ON m.id = u.reporting_manager_user_id" : ""}
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId],
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0] as Record<string, unknown>;
  const filled = COMPLETENESS_FIELDS.reduce((acc, key) => {
    const value = row[key];
    const present = value !== null && value !== undefined && String(value).trim() !== "";
    return acc + (present ? 1 : 0);
  }, 0);

  return {
    ...row,
    profile_completeness: Math.round((filled / COMPLETENESS_FIELDS.length) * 100),
  };
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
  const caps = await hasUsersColumns([
    "employee_code",
    "phone",
    "department",
    "designation",
    "employment_type",
    "joining_date",
    "reporting_manager_user_id",
    "work_location",
    "employment_status",
    "role",
  ]);
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const managerId = await requireResolvableReportingManager(
        row.reportingManagerUserId || null,
        row.reportingManagerEmail || null,
      );
      const cols = ["full_name", "email"];
      const vals: Array<string | number | null> = [row.fullName, row.email];
      if (caps.employee_code) {
        cols.unshift("employee_code");
        vals.unshift(row.employeeIdCode);
      }
      if (caps.phone) {
        cols.push("phone");
        vals.push(row.phone ?? null);
      }
      if (caps.department) {
        cols.push("department");
        vals.push(row.department ?? null);
      }
      if (caps.designation) {
        cols.push("designation");
        vals.push(row.designation ?? null);
      }
      if (caps.employment_type) {
        cols.push("employment_type");
        vals.push(row.employmentType ?? null);
      }
      if (caps.joining_date) {
        cols.push("joining_date");
        vals.push(row.joiningDate || null);
      }
      if (caps.reporting_manager_user_id) {
        cols.push("reporting_manager_user_id");
        vals.push(managerId);
      }
      if (caps.work_location) {
        cols.push("work_location");
        vals.push(row.workLocation ?? null);
      }
      if (caps.employment_status) {
        cols.push("employment_status");
        vals.push(normalizeEmployeeStatus(row.status));
      }
      if (caps.role) {
        cols.push("role");
        vals.push((row.role || "employee").toLowerCase());
      }
      const placeholders = vals.map((_, i) => {
        const col = cols[i];
        if (col === "joining_date") return `$${i + 1}::date`;
        return `$${i + 1}`;
      });
      await client.query(`INSERT INTO users (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`, vals);
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
  const createOnce = async () => {
    const caps = await hasUsersColumns([
    "employee_code",
    "phone",
    "department",
    "designation",
    "employment_type",
    "joining_date",
    "reporting_manager_user_id",
    "work_location",
    "employment_status",
    "role",
  ]);
    const normalizedStatus = normalizeEmployeeStatus(input.status);
    const role = (input.role || "employee").trim().toLowerCase();
    const managerId = await requireResolvableReportingManager(input.reportingManagerUserId || null, input.reportingManagerEmail || null);
    const cols = ["full_name", "email"];
    const vals: Array<string | number | null> = [input.fullName.trim(), input.email.trim().toLowerCase()];
    if (caps.employee_code) {
      cols.unshift("employee_code");
      vals.unshift(input.employeeIdCode.trim());
    }
    if (caps.phone) {
      cols.push("phone");
      vals.push(input.phone?.trim() || null);
    }
    if (caps.department) {
      cols.push("department");
      vals.push(input.department?.trim() || null);
    }
    if (caps.designation) {
      cols.push("designation");
      vals.push(input.designation?.trim() || null);
    }
    if (caps.employment_type) {
      cols.push("employment_type");
      vals.push(input.employmentType?.trim() || null);
    }
    if (caps.joining_date) {
      cols.push("joining_date");
      vals.push(input.joiningDate || null);
    }
    if (caps.reporting_manager_user_id) {
      cols.push("reporting_manager_user_id");
      vals.push(managerId);
    }
    if (caps.work_location) {
      cols.push("work_location");
      vals.push(input.workLocation?.trim() || null);
    }
    if (caps.employment_status) {
      cols.push("employment_status");
      vals.push(normalizedStatus);
    }
    if (caps.role) {
      cols.push("role");
      vals.push(role);
    }
    const placeholders = vals.map((_, i) => {
      const col = cols[i];
      if (col === "joining_date") return `$${i + 1}::date`;
      return `$${i + 1}`;
    });
    const ins = await query(`INSERT INTO users (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING id`, vals);
    const id = Number(ins.rows[0]?.id || 0);
    await writeAuditLog({
      actorUserId,
      action: "hrms.employee.created",
      metadata: { employee_id: id, email: input.email },
    });
    return id;
  };
  try {
    return await createOnce();
  } catch (error) {
    const missingColumn = extractMissingUsersColumn(error);
    if (!missingColumn) throw error;
    usersColumnCache.set(missingColumn, { exists: false, checkedAt: Date.now() });
    return createOnce();
  }
}

export async function updateEmployee(id: number, input: EmployeeDirectoryInput, actorUserId: number) {
  const updateOnce = async () => {
    const caps = await hasUsersColumns([
    "employee_code",
    "phone",
    "department",
    "designation",
    "employment_type",
    "joining_date",
    "reporting_manager_user_id",
    "work_location",
    "employment_status",
    "role",
  ]);
    const normalizedStatus = normalizeEmployeeStatus(input.status);
    const managerId = await requireResolvableReportingManager(input.reportingManagerUserId || null, input.reportingManagerEmail || null);
    const setClauses = ["full_name = $2", "email = $3"];
    const vals: Array<string | number | null> = [id, input.fullName.trim(), input.email.trim().toLowerCase()];
    let idx = 4;
    if (caps.employee_code) {
      setClauses.unshift(`employee_code = $${idx}`);
      vals.push(input.employeeIdCode.trim());
      idx += 1;
    }
    if (caps.phone) {
      setClauses.push(`phone = $${idx++}`);
      vals.push(input.phone?.trim() || null);
    }
    if (caps.department) {
      setClauses.push(`department = $${idx++}`);
      vals.push(input.department?.trim() || null);
    }
    if (caps.designation) {
      setClauses.push(`designation = $${idx++}`);
      vals.push(input.designation?.trim() || null);
    }
    if (caps.employment_type) {
      setClauses.push(`employment_type = $${idx++}`);
      vals.push(input.employmentType?.trim() || null);
    }
    if (caps.joining_date) {
      setClauses.push(`joining_date = $${idx++}::date`);
      vals.push(input.joiningDate || null);
    }
    if (caps.reporting_manager_user_id) {
      setClauses.push(`reporting_manager_user_id = $${idx++}`);
      vals.push(managerId);
    }
    if (caps.work_location) {
      setClauses.push(`work_location = $${idx++}`);
      vals.push(input.workLocation?.trim() || null);
    }
    if (caps.employment_status) {
      setClauses.push(`employment_status = $${idx++}`);
      vals.push(normalizedStatus);
    }
    if (caps.role) {
      setClauses.push(`role = $${idx++}`);
      vals.push((input.role || "employee").trim().toLowerCase());
    }
    await query(
      `
        UPDATE users
        SET ${setClauses.join(",\n          ")}
        WHERE id = $1
      `,
      vals,
    );
    await writeAuditLog({
      actorUserId,
      action: "hrms.employee.updated",
      metadata: { employee_id: id, status: normalizedStatus },
    });
  };
  try {
    await updateOnce();
  } catch (error) {
    const missingColumn = extractMissingUsersColumn(error);
    if (!missingColumn) throw error;
    usersColumnCache.set(missingColumn, { exists: false, checkedAt: Date.now() });
    await updateOnce();
  }
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
