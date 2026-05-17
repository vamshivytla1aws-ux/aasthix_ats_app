import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import {
  approvePayrollRun,
  createOrUpdatePayrollRun,
  listPayrollHistoryForEmployee,
  listPayrollRuns,
} from "@/lib/hrms/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCsv(rows: Array<Record<string, string | number | null>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => {
          const value = row[header] == null ? "" : String(row[header]);
          const escaped = value.replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

export async function GET(request: Request) {
  const auth = await requirePermission("payroll.run");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const employeeId = Number(url.searchParams.get("employeeId") || 0);
  const format = (url.searchParams.get("format") || "").toLowerCase();
  const [runs, history] = await Promise.all([
    listPayrollRuns(),
    employeeId > 0 ? listPayrollHistoryForEmployee(employeeId) : Promise.resolve([]),
  ]);
  if (format === "csv") {
    const csv = toCsv(
      runs.map((run: any) => ({
        id: Number(run.id),
        month: Number(run.month),
        year: Number(run.year),
        status: String(run.status),
        generated_at: run.generated_at ? new Date(run.generated_at).toISOString() : "",
        approved_at: run.approved_at ? new Date(run.approved_at).toISOString() : "",
      })),
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"payroll-runs.csv\"",
      },
    });
  }
  return NextResponse.json({ runs, history });
}

export async function POST(request: Request) {
  const auth = await requirePermission("payroll.run");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as
    | { month?: number; year?: number; status?: "draft" | "generated" | "approved"; notes?: string | null }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const month = Number(body.month);
  const year = Number(body.year);
  if (!(month >= 1 && month <= 12) || !(year >= 2000)) {
    return NextResponse.json({ error: "Valid month and year are required." }, { status: 400 });
  }
  const id = await createOrUpdatePayrollRun({
    month,
    year,
    status: body.status || "generated",
    notes: body.notes || null,
    actorUserId: auth.access.user_id,
  });
  return NextResponse.json({ id, operation_status: "success", user_message: "Payroll run generated." });
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("payroll.approve");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { id?: number; action?: "approve" } | null;
  if (!body || !Number(body.id)) return NextResponse.json({ error: "Payroll run id is required." }, { status: 400 });
  if (body.action !== "approve") return NextResponse.json({ error: "Only approve action is supported." }, { status: 400 });
  await approvePayrollRun(Number(body.id), auth.access.user_id);
  return NextResponse.json({ operation_status: "success", user_message: "Payroll run approved." });
}
