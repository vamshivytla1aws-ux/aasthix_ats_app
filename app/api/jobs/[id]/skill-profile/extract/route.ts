import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { runSkillProfileExtractCore } from "@/lib/matchJobs/runSkillProfileExtractCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Avoid platform default cutting long rescoring runs (e.g. Vercel). */
export const maxDuration = 600;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const result = await runSkillProfileExtractCore({ jobId, userId: user.user_id });

    return NextResponse.json({
      ok: true,
      profile: {
        must_have: result.profile.must_have,
        nice_to_have: result.profile.nice_to_have,
        keywords: result.profile.keywords,
        mode: result.profile.mode,
      },
      candidates_scored: result.candidatesScored,
      ai_hybrid: !result.aiMatchDisabled,
    });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "42P01") {
      return NextResponse.json(
        { error: "Run migration 0032_job_skill_matching.sql to enable skill matching" },
        { status: 400 }
      );
    }
    console.error("skill-profile extract", error);
    return NextResponse.json({ error: "Failed to extract skill profile" }, { status: 500 });
  }
}
