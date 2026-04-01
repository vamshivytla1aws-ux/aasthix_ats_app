import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { runNoAiMatchForJob } from "@/lib/noAiMatch/runNoAiMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const jobIdRaw = (body as { jobId?: unknown })?.jobId;
    const jobId = typeof jobIdRaw === "string" ? Number(jobIdRaw) : Number(jobIdRaw);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const result = await runNoAiMatchForJob(jobId);
    console.log(
      JSON.stringify({
        tag: "no_ai_match",
        jobId,
        processed: result.processed,
        ms: Date.now() - started,
        prefilter: result.meta.prefilter,
      })
    );
    return NextResponse.json(result);
  } catch (e: unknown) {
    const status =
      e && typeof e === "object" && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
    const msg = e instanceof Error ? e.message : "Failed";
    if (status === 404) return NextResponse.json({ error: msg }, { status: 404 });
    if (status === 400) return NextResponse.json({ error: msg }, { status: 400 });
    if (status === 504) return NextResponse.json({ error: msg }, { status: 504 });
    if (status === 503) return NextResponse.json({ error: msg }, { status: 503 });
    if (status === 502) return NextResponse.json({ error: msg }, { status: 502 });
    console.error("POST /api/match/no-ai", e);
    return NextResponse.json({ error: msg || "Unexpected error" }, { status: 500 });
  }
}
