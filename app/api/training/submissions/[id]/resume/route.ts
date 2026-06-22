import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { readTrainingResumeForResponse } from "@/lib/training/service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  try {
    const resume = await readTrainingResumeForResponse(id);
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    return new NextResponse(resume.body, {
      status: 200,
      headers: {
        "Content-Type": resume.contentType,
        "Content-Disposition": `inline; filename="${resume.fileName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("training resume GET", error);
    return NextResponse.json({ error: "Failed to load resume" }, { status: 500 });
  }
}
