import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { regenerateTrainingSubmissionQuestions } from "@/lib/training/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("jobs.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  try {
    const submission = await regenerateTrainingSubmissionQuestions(id);
    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    return NextResponse.json({ submission });
  } catch (error) {
    console.error("training regenerate POST", error);
    return NextResponse.json({ error: "Failed to regenerate questions" }, { status: 500 });
  }
}
