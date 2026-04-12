import type { Metadata } from "next";
import Link from "next/link";
import SingleJobCareersPage from "@/components/careers/SingleJobCareersPage";
import { getPublicCareersJob } from "@/lib/careersPublicJob";

export const dynamic = "force-dynamic";

function metadataForUnavailable(): Metadata {
  return {
    title: "Job not available | Careers",
    description: "This job link is no longer accepting applications.",
  };
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const resolved = await params;
  const jobId = Number(resolved.id);
  if (!Number.isFinite(jobId) || jobId <= 0) return metadataForUnavailable();

  const data = await getPublicCareersJob(jobId);
  if (!data.job) return metadataForUnavailable();

  const title = `${data.job.title} | Apply now`;
  const description = [
    data.job.location,
    data.job.employment_type,
    data.job.experience_requirement,
  ]
    .filter(Boolean)
    .join(" • ");

  return {
    title,
    description: description || "Explore the role details and apply directly.",
    openGraph: {
      title,
      description: description || "Explore the role details and apply directly.",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || "Explore the role details and apply directly.",
    },
  };
}

export default async function SingleJobPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await params;
  const jobId = Number(resolved.id);
  const data =
    Number.isFinite(jobId) && jobId > 0
      ? await getPublicCareersJob(jobId)
      : { configured: true, job: null };

  if (!data.configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-slate-900/60 p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-semibold text-white">Careers portal not configured</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            This public job page is not available yet. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  if (!data.job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-slate-900/60 p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-semibold text-white">Job no longer available</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            This public job link is closed or no longer accepting applications.
          </p>
          <Link
            href="/careers"
            className="mt-6 inline-flex rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            View other open jobs
          </Link>
        </div>
      </div>
    );
  }

  return <SingleJobCareersPage job={data.job} />;
}
