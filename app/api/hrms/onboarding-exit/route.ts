import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { createWorkflow, listOnboardingExit, updateWorkflow, type WorkflowType } from "@/lib/hrms/onboardingExit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    access.role !== "admin" &&
    !access.permissions["onboarding_exit.view_all"] &&
    !access.permissions["onboarding_exit.view_team"] &&
    !access.permissions["onboarding_exit.view_self"]
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const workflowType = (url.searchParams.get("type") || "") as WorkflowType;
  const rows = await listOnboardingExit({
    actorUserId: access.user_id,
    role: access.role,
    workflowType: workflowType === "onboarding" || workflowType === "exit" ? workflowType : undefined,
  });
  return NextResponse.json({ workflows: rows });
}

export async function POST(request: Request) {
  const auth = await requirePermission("onboarding_exit.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as
    | {
        userId?: number;
        workflowType?: WorkflowType;
        checklist?: Record<string, unknown>;
        resignationReason?: string | null;
        noticeStartDate?: string | null;
        noticeEndDate?: string | null;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  if (!Number(body.userId)) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  if (!(body.workflowType === "onboarding" || body.workflowType === "exit")) {
    return NextResponse.json({ error: "workflowType must be onboarding/exit." }, { status: 400 });
  }
  const id = await createWorkflow({
    userId: Number(body.userId),
    workflowType: body.workflowType,
    checklist: body.checklist || {},
    resignationReason: body.resignationReason || null,
    noticeStartDate: body.noticeStartDate || null,
    noticeEndDate: body.noticeEndDate || null,
    actorUserId: auth.access.user_id,
  });
  return NextResponse.json({ id, operation_status: "success", user_message: "Workflow created." });
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("onboarding_exit.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as
    | {
        id?: number;
        checklist?: Record<string, unknown>;
        status?: string;
        finalSettlementStatus?: string | null;
        resignationReason?: string | null;
        noticeStartDate?: string | null;
        noticeEndDate?: string | null;
        decision?: "approved" | "rejected" | null;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  if (!Number(body.id)) return NextResponse.json({ error: "Workflow id is required." }, { status: 400 });
  const ok = await updateWorkflow({
    id: Number(body.id),
    checklist: body.checklist || undefined,
    status: body.status || undefined,
    finalSettlementStatus: body.finalSettlementStatus ?? undefined,
    resignationReason: body.resignationReason ?? undefined,
    noticeStartDate: body.noticeStartDate ?? undefined,
    noticeEndDate: body.noticeEndDate ?? undefined,
    decision: body.decision ?? null,
    actorUserId: auth.access.user_id,
  });
  if (!ok) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  return NextResponse.json({ operation_status: "success", user_message: "Workflow updated." });
}
