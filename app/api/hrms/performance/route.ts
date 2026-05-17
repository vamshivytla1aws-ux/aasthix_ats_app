import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import {
  createPerformanceGoal,
  createPerformanceCycle,
  listPerformanceCycles,
  listPerformanceGoals,
  listPerformanceReviews,
  upsertPerformanceReview,
} from "@/lib/hrms/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    access.role !== "admin" &&
    !access.permissions["performance.view_all"] &&
    !access.permissions["performance.view_team"] &&
    !access.permissions["performance.view_self"]
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const cycleId = Number(url.searchParams.get("cycleId") || 0);
  const [cycles, reviews] = await Promise.all([
    listPerformanceCycles(),
    listPerformanceReviews({
      actorUserId: access.user_id,
      role: access.role,
      cycleId: Number.isFinite(cycleId) && cycleId > 0 ? cycleId : undefined,
    }),
    
  ]);
  const goals = await listPerformanceGoals(Number.isFinite(cycleId) && cycleId > 0 ? cycleId : undefined);
  return NextResponse.json({ cycles, reviews, goals });
}

export async function POST(request: Request) {
  const auth = await requirePermission("performance.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as
    | {
        mode?: "cycle" | "goal" | "review";
        name?: string;
        startDate?: string;
        endDate?: string;
        cycleId?: number;
        employeeId?: number;
        title?: string;
        description?: string;
        weightPercent?: number;
        selfReview?: Record<string, unknown>;
        managerReview?: Record<string, unknown>;
        hrReview?: Record<string, unknown>;
        rating?: number | null;
        recommendation?: string | null;
        status?: string;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  if (body.mode === "cycle") {
    if (!body.name?.trim() || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: "Cycle name/start/end are required." }, { status: 400 });
    }
    const id = await createPerformanceCycle({
      name: body.name.trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      actorUserId: auth.access.user_id,
    });
    return NextResponse.json({ id, operation_status: "success", user_message: "Performance cycle created." });
  }

  if (body.mode === "goal") {
    if (!Number(body.cycleId) || !Number(body.employeeId) || !body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json({ error: "cycleId, employeeId, title and description are required." }, { status: 400 });
    }
    const id = await createPerformanceGoal({
      cycleId: Number(body.cycleId),
      employeeId: Number(body.employeeId),
      title: body.title.trim(),
      description: body.description.trim(),
      weightPercent: Number(body.weightPercent ?? 0),
      actorUserId: auth.access.user_id,
    });
    return NextResponse.json({ id, operation_status: "success", user_message: "Performance goal created." });
  }

  if (!Number(body.cycleId) || !Number(body.employeeId)) {
    return NextResponse.json({ error: "cycleId and employeeId are required for review." }, { status: 400 });
  }
  const id = await upsertPerformanceReview({
    cycleId: Number(body.cycleId),
    employeeId: Number(body.employeeId),
    selfReview: body.selfReview || {},
    managerReview: body.managerReview || {},
    hrReview: body.hrReview || {},
    rating: body.rating == null ? null : Number(body.rating),
    recommendation: body.recommendation || null,
    status: body.status || "submitted",
    actorUserId: auth.access.user_id,
  });
  return NextResponse.json({ id, operation_status: "success", user_message: "Performance review saved." });
}
