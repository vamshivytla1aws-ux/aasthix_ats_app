import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getPublicCareersJob } from "@/lib/careersPublicJob";
import { buildPublicUrl } from "@/lib/publicUrl";
import { fetchOpenAiChatCompletions, isAbortError } from "@/lib/openaiChat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftRequest = {
  platform?: string;
};

type JobRow = {
  id: number;
  title: string;
  location: string | null;
  employment_type: string | null;
  experience_requirement: string | null;
  description: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function ensureMandatoryFooter(text: string, shareUrl: string) {
  const withoutFooter = text
    .replace(/apply here:\s*https?:\/\/\S+/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .trim();

  const withHashtag = /#AASTHIXTALENT/i.test(withoutFooter)
    ? withoutFooter
    : `${withoutFooter}\n\n#AASTHIXTALENT`;

  return `${withHashtag.trim()}\n\nApply here:\n${shareUrl}`.trim();
}

async function generateLinkedInDraft(job: JobRow, shareUrl: string) {
  if (!process.env.OPENAI_API_KEY) {
    return { error: "OPENAI_API_KEY is not configured." } as const;
  }

  const model = process.env.SOCIAL_SHARE_MODEL?.trim() || "gpt-4o-mini";
  const description = clean(job.description).slice(0, 8000);
  const location = clean(job.location);
  const employmentType = clean(job.employment_type);
  const experience = clean(job.experience_requirement);

  const prompt = [
    "Create a LinkedIn post for the following job description.",
    "Do not mention the company name.",
    "Keep it concise, recruiter-friendly, and suitable for a professional LinkedIn audience.",
    "Include the mandatory hashtag #AASTHIXTALENT.",
    'End with exactly:\nApply here:\n' + shareUrl,
    "",
    "Job details:",
    `Title: ${job.title}`,
    location ? `Location: ${location}` : "",
    employmentType ? `Employment type: ${employmentType}` : "",
    experience ? `Experience: ${experience}` : "",
    description ? `Description:\n${description}` : "",
    "",
    'Return only plain text for the post body. Do not return JSON or markdown.',
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetchOpenAiChatCompletions(
      {
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You write polished recruiting social posts. Output plain text only, never JSON, never markdown, and never mention confidential or missing details.",
          },
          { role: "user", content: prompt },
        ],
      },
      45_000
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("social-draft openai", response.status, detail);
      return { error: "AI drafting is unavailable right now." } as const;
    }

    const json = await response.json();
    const content = clean(json?.choices?.[0]?.message?.content);
    if (!content) {
      return { error: "AI returned an empty draft." } as const;
    }

    return { postText: ensureMandatoryFooter(content, shareUrl) } as const;
  } catch (error) {
    console.error("social-draft openai", error);
    return {
      error: isAbortError(error)
        ? "AI drafting timed out. Please try again."
        : "Failed to generate the LinkedIn draft.",
    } as const;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const params = await context.params;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as DraftRequest;
    if (String(body.platform || "").trim().toLowerCase() !== "linkedin") {
      return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
    }

    const publicJob = await getPublicCareersJob(jobId);
    if (!publicJob.configured) {
      return NextResponse.json({ error: "Careers portal is not configured" }, { status: 503 });
    }
    if (!publicJob.job) {
      return NextResponse.json({ error: "Job is no longer available for public sharing." }, { status: 404 });
    }

    const jobRes = await query(
      `
      SELECT id, title, location, employment_type, experience_requirement, description
      FROM jobs
      WHERE id = $1
      LIMIT 1
      `,
      [jobId]
    );
    if (jobRes.rowCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = jobRes.rows[0] as JobRow;
    const shareUrl = buildPublicUrl(`/careers/job/${jobId}`);
    const draft = await generateLinkedInDraft(job, shareUrl);
    if ("error" in draft) {
      return NextResponse.json({ error: draft.error, share_url: shareUrl }, { status: 503 });
    }

    return NextResponse.json({
      platform: "linkedin",
      share_url: shareUrl,
      post_text: draft.postText,
      job_summary: {
        title: job.title,
        location: clean(job.location) || null,
        employment_type: clean(job.employment_type) || null,
        experience_requirement: clean(job.experience_requirement) || null,
      },
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/social-draft", error);
    return NextResponse.json({ error: "Failed to prepare social draft." }, { status: 500 });
  }
}
