import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getLeavePolicies, updateLeavePolicies } from "@/lib/leave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("leave.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const policy = await getLeavePolicies();
    return NextResponse.json({ policy });
  } catch (error) {
    console.error("GET /api/leave/policies", error);
    return NextResponse.json({ error: "Failed to load leave policy." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission("leave.manage_policy");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          sick_accrual_monthly?: number;
          casual_accrual_monthly?: number;
          sick_carry_forward_cap?: number;
          casual_carry_forward_cap?: number;
        }
      | null;
    if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    const policy = await updateLeavePolicies(auth.access.user_id, body);
    return NextResponse.json({
      policy,
      operation_status: "success",
      user_message: "Leave policy updated.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update leave policy.",
        operation_status: "error",
        user_message: "Leave policy update failed.",
      },
      { status: 400 },
    );
  }
}
