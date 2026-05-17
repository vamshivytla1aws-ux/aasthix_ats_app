import { query } from "@/lib/db";

export type HrmsSchemaDiagnostics = {
  status: "healthy" | "warning";
  missing_tables: string[];
  missing_columns: string[];
  checked_at: string;
  recommended_migrations: string[];
  checked_query_paths?: string[];
};

const EXPECTED_TABLES = [
  "attendance_shift_rules",
  "attendance_corrections",
  "wfh_requests",
  "employee_documents",
  "employee_onboarding_exit",
  "performance_cycles",
  "performance_goals",
  "performance_reviews",
  "payroll_runs",
  "payslips",
] as const;

const EXPECTED_COLUMNS = [
  { table: "users", column: "employee_code" },
  { table: "users", column: "employment_status" },
  { table: "users", column: "reporting_manager_user_id" },
  { table: "employee_documents", column: "expiry_date" },
  { table: "payroll_runs", column: "locked_by_user_id" },
  { table: "payroll_runs", column: "locked_at" },
  { table: "payroll_runs", column: "unlocked_by_user_id" },
  { table: "payroll_runs", column: "unlocked_at" },
  { table: "payroll_runs", column: "unlock_reason" },
] as const;

const MIGRATION_HINTS: Record<string, string> = {
  "users.employee_code": "Run migrations including 0076/0077 and employee directory migrations.",
  "users.employment_status": "Run employee directory baseline migrations.",
  "users.reporting_manager_user_id": "Run employee directory baseline migrations.",
  "employee_documents.expiry_date": "Run migration 0077_hrms_doc_compliance_payroll_controls.sql",
  "payroll_runs.locked_by_user_id": "Run migration 0077_hrms_doc_compliance_payroll_controls.sql",
  "payroll_runs.locked_at": "Run migration 0077_hrms_doc_compliance_payroll_controls.sql",
  "payroll_runs.unlocked_by_user_id": "Run migration 0077_hrms_doc_compliance_payroll_controls.sql",
  "payroll_runs.unlocked_at": "Run migration 0077_hrms_doc_compliance_payroll_controls.sql",
  "payroll_runs.unlock_reason": "Run migration 0077_hrms_doc_compliance_payroll_controls.sql",
};

export function diagnosticsOperationStatus(input: HrmsSchemaDiagnostics): "success" | "partial" {
  return input.status === "warning" ? "partial" : "success";
}

export async function getHrmsSchemaDiagnostics(): Promise<HrmsSchemaDiagnostics> {
  const [tableRes, columnRes] = await Promise.all([
    query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `,
      [],
    ),
    query(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `,
      [],
    ),
  ]);

  const tableSet = new Set((tableRes.rows as Array<{ table_name: string }>).map((row) => row.table_name));
  const columnSet = new Set(
    (columnRes.rows as Array<{ table_name: string; column_name: string }>).map((row) => `${row.table_name}.${row.column_name}`),
  );

  const missingTables = EXPECTED_TABLES.filter((tableName) => !tableSet.has(tableName));
  const missingColumns = EXPECTED_COLUMNS
    .map((item) => `${item.table}.${item.column}`)
    .filter((key) => !columnSet.has(key));

  const recommendedMigrations = Array.from(
    new Set(
      missingColumns
        .map((key) => MIGRATION_HINTS[key])
        .filter((item): item is string => Boolean(item)),
    ),
  );

  return {
    status: missingTables.length > 0 || missingColumns.length > 0 ? "warning" : "healthy",
    missing_tables: [...missingTables],
    missing_columns: [...missingColumns],
    checked_at: new Date().toISOString(),
    recommended_migrations: recommendedMigrations,
    checked_query_paths: [
      "lib/hrms/employeeDirectory.ts:listEmployees",
      "lib/hrms/employeeDirectory.ts:createEmployee",
      "lib/hrms/employeeDirectory.ts:updateEmployee",
      "lib/hrms/employeeDirectory.ts:importEmployees",
      "lib/hrms/employeeDirectory.ts:applyImportConflictChecks",
    ],
  };
}
