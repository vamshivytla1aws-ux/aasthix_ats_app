import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";
import { diagnosticsOperationStatus, getHrmsSchemaDiagnostics } from "@/lib/hrms/schemaDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let lastWarningAuditAt = 0;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const diagnostics = await getHrmsSchemaDiagnostics();
  const operationStatus = diagnosticsOperationStatus(diagnostics);

  await writeAuditLog({
    actorUserId: auth.access.user_id,
    action: "hrms.schema_diagnostics.opened",
    metadata: { status: diagnostics.status },
  });

  if (diagnostics.status === "warning") {
    const now = Date.now();
    if (now - lastWarningAuditAt > 5 * 60 * 1000) {
      lastWarningAuditAt = now;
      await writeAuditLog({
        actorUserId: auth.access.user_id,
        action: "hrms.schema_diagnostics.warning",
        metadata: {
          missing_tables: diagnostics.missing_tables,
          missing_columns: diagnostics.missing_columns,
        },
      });
    }
  }

  return NextResponse.json({
    operation_status: operationStatus,
    diagnostics,
    user_message:
      diagnostics.status === "warning"
        ? "HRMS schema drift detected. Some columns/tables are missing."
        : "HRMS schema diagnostics healthy.",
  });
}

