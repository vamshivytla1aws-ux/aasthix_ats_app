import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import {
  approvePayrollRun,
  createOrUpdatePayrollRun,
  listPayrollVariance,
  lockPayrollRun,
  listPayrollHistoryForEmployee,
  listPayrollRuns,
  unlockPayrollRun,
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
  const month = Number(url.searchParams.get("month") || 0);
  const year = Number(url.searchParams.get("year") || 0);
  const view = (url.searchParams.get("view") || "").toLowerCase();
  const format = (url.searchParams.get("format") || "").toLowerCase();
  if (view === "variance") {
    if (!(month >= 1 && month <= 12) || !(year >= 2000)) {
      return NextResponse.json({ error: "Valid month and year are required for variance." }, { status: 400 });
    }
    const variance = await listPayrollVariance(month, year);
    return NextResponse.json({ variance, month, year });
  }
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
  try {
    const auth = await requirePermission("payroll.run");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json().catch(() => null)) as
      | { month?: number; year?: number; status?: "draft" | "generated"; notes?: string | null }
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate payroll run.";
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    return NextResponse.json(
      {
        operation_status: code === "PAYROLL_LOCKED" ? "blocked" : "error",
        error: message,
        user_message: message,
        hint: code === "PAYROLL_LOCKED" ? "Unlock the payroll month to regenerate." : undefined,
      },
      { status: code === "PAYROLL_LOCKED" ? 409 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requirePermission("payroll.approve");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json().catch(() => null)) as { id?: number; action?: "approve" | "lock" | "unlock"; reason?: string } | null;
    if (!body || !Number(body.id)) return NextResponse.json({ error: "Payroll run id is required." }, { status: 400 });
    if (body.action !== "approve" && body.action !== "lock" && body.action !== "unlock") {
      return NextResponse.json({ error: "Supported actions are approve, lock, and unlock." }, { status: 400 });
    }
    if (body.action === "approve") {
      await approvePayrollRun(Number(body.id), auth.access.user_id);
      return NextResponse.json({ operation_status: "success", user_message: "Payroll run approved." });
    }
    if (body.action === "unlock") {
      if (auth.access.role !== "admin") {
        return NextResponse.json(
          {
            operation_status: "blocked",
            error: "Only admin can unlock payroll months.",
            user_message: "Only admin can unlock payroll months.",
          },
          { status: 403 },
        );
      }
      const reason = String(body.reason || "").trim();
      if (!reason) {
        return NextResponse.json(
          {
            operation_status: "blocked",
            error: "Unlock reason is required.",
            user_message: "Unlock reason is required.",
          },
          { status: 400 },
        );
      }
      await unlockPayrollRun(Number(body.id), auth.access.user_id, reason);
      return NextResponse.json({ operation_status: "success", user_message: "Payroll run unlocked." });
    }
    await lockPayrollRun(Number(body.id), auth.access.user_id);
    return NextResponse.json({ operation_status: "success", user_message: "Payroll run locked." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payroll action failed.";
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    const blockedCodes = new Set(["PAYROLL_LOCKED", "MAKER_CHECKER_BLOCKED", "PAYROLL_NOT_APPROVED"]);
    return NextResponse.json(
      {
        operation_status: blockedCodes.has(code) ? "blocked" : "error",
        error: message,
        user_message: message,
      },
      { status: blockedCodes.has(code) ? 409 : 500 },
    );
  }
}
