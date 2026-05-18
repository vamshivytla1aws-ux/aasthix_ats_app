import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { getHrmsSchemaDiagnostics } from "@/lib/hrms/schemaDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeCount(sql: string, values: Array<string | number> = []) {
  try {
    const res = await query(sql, values);
    return Number(res.rows[0]?.count || 0);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code === "42P01" || code === "42703") return 0;
    throw error;
  }
}

async function safeLatestFailure() {
  try {
    const res = await query(
      `
        SELECT action, created_at
        FROM audit_logs
        WHERE action ILIKE '%blocked%' OR action ILIKE '%failed%'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [],
    );
    if (res.rowCount === 0) return null;
    return {
      action: String(res.rows[0].action || ""),
      at: String(res.rows[0].created_at || ""),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requirePermission("dashboard.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [pendingLeave, pendingCorrections, pendingWfh, pendingOnboardingExit, payrollRunRes, missingManager, incompleteProfiles, docsExpiringSoon, diagnostics, lastFailure] =
    await Promise.all([
      safeCount(`SELECT COUNT(*)::int AS count FROM leave_requests WHERE status = 'pending'`),
      safeCount(`SELECT COUNT(*)::int AS count FROM attendance_corrections WHERE status = 'pending'`),
      safeCount(`SELECT COUNT(*)::int AS count FROM wfh_requests WHERE status = 'pending'`),
      safeCount(`SELECT COUNT(*)::int AS count FROM onboarding_exit_workflows WHERE status = 'in_progress'`),
      query(`SELECT id, status FROM payroll_runs WHERE month = $1 AND year = $2 LIMIT 1`, [month, year]).catch(() => ({ rows: [] as any[] })),
      safeCount(`SELECT COUNT(*)::int AS count FROM users WHERE COALESCE(employment_status,'active')='active' AND reporting_manager_user_id IS NULL`),
      safeCount(`SELECT COUNT(*)::int AS count FROM users WHERE COALESCE(employment_status,'active')='active' AND (COALESCE(phone,'')='' OR COALESCE(department,'')='' OR COALESCE(designation,'')='' OR joining_date IS NULL)`),
      safeCount(`SELECT COUNT(*)::int AS count FROM employee_documents WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'`),
      getHrmsSchemaDiagnostics(),
      safeLatestFailure(),
    ]);

  const payrollRun = payrollRunRes.rows?.[0] ?? null;
  const payrollStatus = payrollRun ? String(payrollRun.status || "draft") : "draft";

  return NextResponse.json({
    operation_status: "success",
    summary: {
      pending_approvals: {
        leave: pendingLeave,
        attendance_corrections: pendingCorrections,
        wfh: pendingWfh,
        onboarding_exit: pendingOnboardingExit,
        total: pendingLeave + pendingCorrections + pendingWfh + pendingOnboardingExit,
      },
      payroll: {
        month,
        year,
        run_id: payrollRun ? Number(payrollRun.id) : null,
        status: payrollStatus,
      },
      setup_gaps: {
        missing_manager: missingManager,
        incomplete_profiles: incompleteProfiles,
      },
      compliance: {
        expiring_documents_30d: docsExpiringSoon,
      },
      diagnostics: {
        status: diagnostics.status,
        missing_tables: diagnostics.missing_tables,
        missing_columns: diagnostics.missing_columns,
      },
      last_failure: lastFailure,
      quick_actions: [
        { label: "Add employee", href: "/hrms/employees" },
        { label: "Set CTC", href: "/hrms/ctc" },
        { label: "Run payroll", href: "/hrms/payroll" },
        { label: "Generate payslips", href: "/salary" },
      ],
    },
  });
}

