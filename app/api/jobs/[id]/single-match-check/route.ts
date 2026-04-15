import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { insertSingleMatchHistory } from "@/lib/singleMatch/singleMatchHistoryDb";
import { runSingleMatchCheck } from "@/lib/singleMatch/singleMatchService";
import type { SingleMatchCheckApiResponse } from "@/lib/singleMatch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const jobId = Number(params.id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const candidateId = Number((body as { candidateId?: unknown }).candidateId);
    const useAI = Boolean((body as { useAI?: unknown }).useAI);

    if (!Number.isFinite(candidateId) || candidateId <= 0) {
      return NextResponse.json({ error: "candidateId must be a positive number" }, { status: 400 });
    }

    const { result } = await runSingleMatchCheck({ jobId, candidateId, useAI });

    let historySaved = false;
    try {
      const ins = await insertSingleMatchHistory({
        jobId,
        candidateId,
        createdByUserId: user.user_id,
        useAi: useAI,
        result,
      });
      historySaved = ins != null;
    } catch (e) {
      console.error("single-match-check: history insert failed", e);
    }

    const payload: SingleMatchCheckApiResponse = {
      success: true,
      jobId,
      candidateId,
      result,
      history_saved: historySaved,
    };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
    const msg = error instanceof Error ? error.message : "Single match check failed";
    console.error("single-match-check", error);
    if (status >= 400 && status < 500) {
      return NextResponse.json({ error: msg }, { status });
    }
    if (status === 502 || status === 503 || status === 504) {
      return NextResponse.json({ error: msg }, { status });
    }
    return NextResponse.json({ error: "Single match check failed" }, { status: 500 });
  }
}
