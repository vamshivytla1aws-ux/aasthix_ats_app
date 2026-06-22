import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getTrainingSubmissionDetail } from "@/lib/training/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  try {
    const detail = await getTrainingSubmissionDetail(id);
    if (!detail) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    return NextResponse.json({ submission: detail });
  } catch (error) {
    console.error("training submission GET", error);
    return NextResponse.json({ error: "Failed to load submission" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("jobs.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reviewStatus = String(body?.review_status || "").trim().toLowerCase();
    const reviewerNotes = String(body?.reviewer_notes || "").trim() || null;
    const allowed = new Set(["new", "in_review", "reviewed", "contacted", "archived"]);
    if (!allowed.has(reviewStatus)) {
      return NextResponse.json({ error: "Invalid review_status" }, { status: 400 });
    }

    const result = await query(
      `
      UPDATE training_submissions
      SET
        review_status = $2,
        reviewer_notes = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [id, reviewStatus, reviewerNotes]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    const detail = await getTrainingSubmissionDetail(id);
    return NextResponse.json({ submission: detail });
  } catch (error) {
    console.error("training submission PATCH", error);
    return NextResponse.json({ error: "Failed to update submission" }, { status: 500 });
  }
}
