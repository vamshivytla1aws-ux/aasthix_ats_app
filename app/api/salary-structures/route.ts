import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { createSalaryStructure, listSalaryEmployees } from "@/lib/salary/service";
import type { SalaryCalcInput } from "@/lib/salary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidPan(pan: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

export async function GET() {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const employees = await listSalaryEmployees();
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  const auth = await requirePermission("salary.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as SalaryCalcInput | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  if (body.pan && !isValidPan(String(body.pan).toUpperCase())) {
    return NextResponse.json({ error: "Invalid PAN format" }, { status: 400 });
  }
  if (body.uanNumber && !/^[0-9]{1,20}$/.test(String(body.uanNumber))) {
    return NextResponse.json({ error: "UAN must be numeric" }, { status: 400 });
  }
  try {
    const saved = await createSalaryStructure(body, auth.access.user_id);
    return NextResponse.json({
      ok: true,
      salary_structure_id: saved.salaryStructureId,
      calculation: saved.calc,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save salary structure" },
      { status: 400 }
    );
  }
}
