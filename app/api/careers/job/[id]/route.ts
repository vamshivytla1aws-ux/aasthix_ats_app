import { NextResponse } from "next/server";
import { getPublicCareersJob } from "@/lib/careersPublicJob";
import { buildPublicUrl } from "@/lib/publicUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const jobId = Number(params.id);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const data = await getPublicCareersJob(jobId);
  if (!data.configured) {
    return NextResponse.json({ configured: false, error: "Careers portal is not configured" }, { status: 503 });
  }
  if (!data.job) {
    return NextResponse.json({ configured: true, error: "Job is no longer available" }, { status: 404 });
  }

  const publicPath = `/careers/job/${data.job.id}`;
  const { created_by_user_id: _ownerId, ...publicJob } = data.job;
  return NextResponse.json({
    configured: true,
    public_path: publicPath,
    public_url: buildPublicUrl(publicPath),
    job: publicJob,
  });
}
