import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuestionCategory = "technical" | "scenario" | "behavioral" | "hr";

type QuestionPayload = {
  category: QuestionCategory;
  question: string;
  sort_order?: number;
};

function fallbackQuestions(title: string) {
  const safeTitle = title || "this role";
  return {
    technical: [
      `Which core skills are most important for ${safeTitle}, and how have you applied them recently?`,
      `Walk through a challenging technical issue you solved in your last project.`,
      "How do you approach code quality, testing, and production readiness?",
      "What trade-offs do you consider while choosing tools, frameworks, or architecture?",
      "How do you handle performance issues and debugging under deadlines?",
    ],
    scenario: [
      `You join a project late for ${safeTitle}. How do you ramp up quickly and deliver value in 2 weeks?`,
      "A critical dependency breaks before release. What is your recovery plan?",
      "You receive ambiguous requirements from stakeholders. How do you proceed?",
      "A high-priority bug impacts users in production. Describe your incident workflow.",
      "How would you prioritize multiple urgent tasks from different teams?",
    ],
    behavioral: [
      "Tell me about a time you handled conflict in a project team.",
      "Describe a time you made a mistake and how you recovered.",
      "How do you mentor or support teammates when deadlines are tight?",
      "Share an example where you improved a process, not just a feature.",
      "How do you handle feedback from peers or managers?",
    ],
    hr: [
      "Why are you interested in this role?",
      "What type of work environment helps you perform your best?",
      "What are your short-term and long-term career goals?",
      "What notice period and joining timeline can you commit to?",
      "Do you have any constraints around shift, location, or travel?",
    ],
  };
}

async function generateWithAI(input: {
  title: string;
  description: string;
  employmentType: string;
  skills: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Generate structured interview questions for this job.
Return strict JSON object with keys:
{
  "technical": string[5],
  "scenario": string[5],
  "behavioral": string[5],
  "hr": string[5]
}
Job Title: ${input.title}
Employment Type: ${input.employmentType || "N/A"}
Skills: ${input.skills || "N/A"}
Job Description:
${input.description || "N/A"}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are an expert interviewer assistant." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error("OpenAI request failed");
  const payload = await res.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No AI response");
  const parsed = JSON.parse(text);
  return {
    technical: Array.isArray(parsed?.technical) ? parsed.technical : [],
    scenario: Array.isArray(parsed?.scenario) ? parsed.scenario : [],
    behavioral: Array.isArray(parsed?.behavioral) ? parsed.behavioral : [],
    hr: Array.isArray(parsed?.hr) ? parsed.hr : [],
  };
}

function normalizeQuestions(raw: any): QuestionPayload[] {
  const categories: QuestionCategory[] = ["technical", "scenario", "behavioral", "hr"];
  const rows: QuestionPayload[] = [];
  for (const category of categories) {
    const list = Array.isArray(raw?.[category]) ? raw[category] : [];
    list
      .map((x: any) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 10)
      .forEach((question: string, idx: number) => {
        rows.push({ category, question, sort_order: idx + 1 });
      });
  }
  return rows;
}

async function saveQuestions(jobId: number, questions: QuestionPayload[]) {
  await query("BEGIN");
  try {
    await query(
      `DELETE FROM job_interview_questions
       WHERE job_id = $1`,
      [jobId]
    );

    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      await query(
        `INSERT INTO job_interview_questions (job_id, category, question, sort_order)
         VALUES ($1, $2, $3, $4)`,
      [jobId, q.category, q.question, q.sort_order ?? i + 1]
      );
    }
    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    throw e;
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const rows = await query(
      `SELECT q.id, q.category, q.question, q.sort_order, q.created_at
       FROM job_interview_questions q
       WHERE q.job_id = $1
       ORDER BY q.category, q.sort_order, q.id`,
      [jobId]
    );
    return NextResponse.json({ questions: rows.rows });
  } catch (error: any) {
    if (error?.code === "42P01") return NextResponse.json({ questions: [] });
    return NextResponse.json({ error: "Failed to fetch interview questions" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const body = await request.json();
    const questions = Array.isArray(body?.questions) ? body.questions : [];
    const normalized = questions
      .map((q: any, idx: number) => ({
        category: q?.category as QuestionCategory,
        question: String(q?.question || "").trim(),
        sort_order: Number.isFinite(Number(q?.sort_order)) ? Number(q.sort_order) : idx + 1,
      }))
      .filter((q: any) => ["technical", "scenario", "behavioral", "hr"].includes(q.category) && q.question);

    await saveQuestions(jobId, normalized);
    return NextResponse.json({ ok: true, count: normalized.length });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Run latest migrations to enable interview questions" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save interview questions" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const jobRes = await query(
      `SELECT id, title, description, employment_type
       FROM jobs
       WHERE id = $1
       LIMIT 1`,
      [jobId]
    );
    if (jobRes.rowCount === 0) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const job = jobRes.rows[0] as { title: string; description: string; employment_type: string };

    const body = await request.json().catch(() => ({}));
    const skills = String(body?.skills || "").trim();

    let generatedMode: "AI" | "RULE_BASED" = "RULE_BASED";
    let generated = fallbackQuestions(job.title);
    try {
      const ai = await generateWithAI({
        title: job.title,
        description: job.description || "",
        employmentType: job.employment_type || "",
        skills,
      });
      if (ai) {
        generated = {
          technical: ai.technical.length ? ai.technical : generated.technical,
          scenario: ai.scenario.length ? ai.scenario : generated.scenario,
          behavioral: ai.behavioral.length ? ai.behavioral : generated.behavioral,
          hr: ai.hr.length ? ai.hr : generated.hr,
        };
        generatedMode = "AI";
      }
    } catch {
      // deterministic fallback
    }

    const normalized = normalizeQuestions(generated);
    await saveQuestions(jobId, normalized);
    return NextResponse.json({
      generated_mode: generatedMode,
      questions: normalized,
    });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Run latest migrations to enable interview questions" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to generate interview questions" }, { status: 500 });
  }
}
