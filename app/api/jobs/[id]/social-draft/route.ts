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

function inferWorkMode(job: JobRow) {
  const text = [clean(job.title), clean(job.description), clean(job.location)].join(" ").toLowerCase();
  if (/\bremote\b/.test(text)) return "Remote";
  if (/\bhybrid\b/.test(text)) return "Hybrid";
  if (/\bon[-\s]?site\b/.test(text) || /\bonsite\b/.test(text)) return "On-site";
  return "Not specified";
}

function inferNoticePeriod(job: JobRow) {
  const text = clean(job.description);
  const direct =
    text.match(/notice\s*period\s*[:\-]?\s*([^\n.,;]+)/i)?.[1]?.trim() ||
    text.match(/join(?:ing)?\s*within\s*([^\n.,;]+)/i)?.[1]?.trim() ||
    text.match(/immediate\s+joiners?/i)?.[0]?.trim();
  return direct || "Not specified";
}

function toHashtag(value: string) {
  const words = clean(value)
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return null;
  return `#${words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("")}`;
}

function inferHashtags(job: JobRow) {
  const tags = new Set<string>(["#AASTHIXTALENT", "#Hiring"]);

  const titleTag = toHashtag(job.title);
  if (titleTag) tags.add(titleTag);

  const locationTag = clean(job.location)
    .split(/[\/,]/)
    .map((part) => toHashtag(part))
    .find(Boolean);
  if (locationTag) tags.add(locationTag);

  const employmentTag = toHashtag(clean(job.employment_type).replace(/\s+/g, " "));
  if (employmentTag) tags.add(employmentTag);

  const description = clean(job.description).toLowerCase();
  const keywordMap: Array<[string, string]> = [
    ["power bi", "#PowerBI"],
    ["azure", "#Azure"],
    ["sql", "#SQL"],
    ["data", "#DataAnalytics"],
    ["analytics", "#Analytics"],
    ["developer", "#TechJobs"],
  ];
  for (const [needle, tag] of keywordMap) {
    if (description.includes(needle) || clean(job.title).toLowerCase().includes(needle)) {
      tags.add(tag);
    }
  }

  return Array.from(tags).slice(0, 12);
}

function stripAiLookingMarkdown(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureMandatoryFooter(text: string, shareUrl: string, hashtags: string[]) {
  const normalized = stripAiLookingMarkdown(text);
  const withoutFooter = normalized
    .replace(/apply here:\s*https?:\/\/\S+/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/#[A-Za-z0-9_]+/g, "")
    .trim();
  const hashtagLine = hashtags.join(" ");
  return `${withoutFooter.trim()}\n\n${hashtagLine}\n\nApply here:\n${shareUrl}`.trim();
}

/** Map OpenAI HTTP errors to recruiter-visible hints (no secrets). */
function openAiFailureHint(status: number, detail: string): string {
  let code: string | undefined;
  let msg = "";
  try {
    const j = JSON.parse(detail) as { error?: { code?: string; message?: string } };
    code = j?.error?.code;
    msg = String(j?.error?.message || "").toLowerCase();
  } catch {
    msg = detail.toLowerCase();
  }
  if (status === 401 || code === "invalid_api_key") {
    return "OpenAI rejected the API key (invalid or expired). Update OPENAI_API_KEY in Railway.";
  }
  if (
    status === 402 ||
    code === "insufficient_quota" ||
    msg.includes("billing") ||
    msg.includes("quota") ||
    msg.includes("payment")
  ) {
    return "OpenAI billing or quota issue. Add credits or check usage limits in OpenAI.";
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return "OpenAI rate limit hit. Wait a few minutes and try again.";
  }
  if ((status === 400 || status === 404) && (msg.includes("model") || code === "model_not_found")) {
    return `AI model not available. Check SOCIAL_SHARE_MODEL (current: ${process.env.SOCIAL_SHARE_MODEL?.trim() || "gpt-4o-mini"}).`;
  }
  return "AI drafting is unavailable right now.";
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
  const workMode = inferWorkMode(job);
  const noticePeriod = inferNoticePeriod(job);
  const hashtags = inferHashtags(job);

  const prompt = [
    "Act as a senior technical recruiter and LinkedIn content writer.",
    "",
    "Write a HIGH-QUALITY LinkedIn hiring post based on the below JD.",
    "",
    "STRICT INSTRUCTIONS:",
    "- Follow a structured format (header -> job details -> responsibilities -> skills -> CTA -> hashtags)",
    "- Use bullet points for responsibilities and skills",
    "- Keep it crisp, professional, and engaging (not generic)",
    "- Avoid long paragraphs",
    "- Include all details: Job Title, Location, Experience, Work Mode, Notice Period",
    "- Add emojis but keep it minimal and professional",
    "- Add a strong call-to-action at the end",
    "- Word limit: 200–250 words",
    "- Use relevant hashtags (8–12 hashtags)",
    "- Mandatory hashtag: #AASTHIXTALENT",
    "- Do NOT skip any important JD details",
    "- Make it look like a recruiter-written post (not AI-generated)",
    "- Do not mention the company name",
    `- End with exactly:\nApply here:\n${shareUrl}`,
    "",
    "Job details:",
    `Job Title: ${job.title}`,
    `Location: ${location || "Not specified"}`,
    `Experience: ${experience || "Not specified"}`,
    `Work Mode: ${workMode}`,
    `Notice Period: ${noticePeriod}`,
    `Employment Type: ${employmentType || "Not specified"}`,
    description ? `Description:\n${description}` : "",
    "",
    `Relevant hashtags to use where appropriate: ${hashtags.join(" ")}`,
    "",
    "Return only plain text for the post body. Do not return JSON or markdown.",
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
      const hint = openAiFailureHint(response.status, detail);
      console.error("social-draft openai", response.status, hint, detail.slice(0, 500));
      return { error: hint } as const;
    }

    const json = await response.json();
    const content = clean(json?.choices?.[0]?.message?.content);
    if (!content) {
      return { error: "AI returned an empty draft." } as const;
    }

    return { postText: ensureMandatoryFooter(content, shareUrl, hashtags) } as const;
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
