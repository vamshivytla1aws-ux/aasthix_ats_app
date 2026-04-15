import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { listSingleMatchHistoryForJob } from "@/lib/singleMatch/singleMatchHistoryDb";
import type { SingleMatchHistoryApiResponse } from "@/lib/singleMatch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const jobId = Number(params.id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));

    const { runs, migrationRequired } = await listSingleMatchHistoryForJob({
      jobId,
      ownerUserId: user.user_id,
      limit,
    });

    const payload: SingleMatchHistoryApiResponse = {
      runs,
      ...(migrationRequired ? { migration_required: true } : {}),
    };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("single-match-check/history", error);
    return NextResponse.json({ error: "Failed to load match history" }, { status: 500 });
  }
}
