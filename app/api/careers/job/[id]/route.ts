import { NextResponse } from "next/server";
import { getPublicCareersJob } from "@/lib/careersPublicJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildPublicUrl(request: Request, path: string) {
  const configured = String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return `${configured}${path}`;
  return new URL(path, request.url).toString();
}

export async function GET(
  request: Request,
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
  return NextResponse.json({
    configured: true,
    public_path: publicPath,
    public_url: buildPublicUrl(request, publicPath),
    job: data.job,
  });
}
