import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { insertSingleMatchHistory } from "@/lib/singleMatch/singleMatchHistoryDb";
import { runSingleMatchCheck } from "@/lib/singleMatch/singleMatchService";
import type { SingleMatchCheckApiResponse } from "@/lib/singleMatch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function buildServerTiming(timings: Record<string, number>) {
  return Object.entries(timings)
    .filter(([, duration]) => Number.isFinite(duration))
    .map(([key, duration]) => `${key.replace(/[^a-z0-9_]/gi, "_")};dur=${duration}`)
    .join(", ");
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const startedAt = performance.now();
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

    const { result, timings } = await runSingleMatchCheck({ jobId, candidateId, useAI });

    let historySaved = false;
    try {
      const historyStartedAt = performance.now();
      const ins = await insertSingleMatchHistory({
        jobId,
        candidateId,
        createdByUserId: user.user_id,
        useAi: useAI,
        result,
      });
      historySaved = ins != null;
      timings.history_insert_ms = Math.round(performance.now() - historyStartedAt);
    } catch (e) {
      console.error("single-match-check: history insert failed", e);
    }
    timings.total_ms = Math.round(performance.now() - startedAt);

    const payload: SingleMatchCheckApiResponse = {
      success: true,
      jobId,
      candidateId,
      result,
      history_saved: historySaved,
    };
    const response = NextResponse.json(payload);
    const serverTiming = buildServerTiming(timings);
    if (serverTiming) response.headers.set("Server-Timing", serverTiming);
    console.info("single-match-check timing", { jobId, candidateId, useAI, timings });
    return response;
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
