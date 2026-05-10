import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuestionCategory = "technical" | "scenario" | "behavioral" | "hr";

type QuestionPayload = {
  category: QuestionCategory;
  question: string;
  reference_answer?: string;
  sort_order?: number;
};

function fallbackQuestions(title: string) {
  const safeTitle = title || "this role";
  return {
    technical: [
      {
        question: `Which core skills are most important for ${safeTitle}, and how have you applied them recently?`,
        reference_answer:
          "Names core stack skills for the role with specific examples.\nExplains impact delivered using those skills.\nMentions recency and depth, not just buzzwords.",
      },
      {
        question: "Walk through a challenging technical issue you solved in your last project.",
        reference_answer:
          "Clearly describes the production issue and constraints.\nExplains root-cause analysis and debugging steps.\nCovers final fix and measurable outcome.",
      },
      {
        question: "How do you approach code quality, testing, and production readiness?",
        reference_answer:
          "Mentions layered testing strategy and review discipline.\nIncludes monitoring, rollback, and deployment checks.\nBalances speed with reliability.",
      },
      {
        question: "What trade-offs do you consider while choosing tools, frameworks, or architecture?",
        reference_answer:
          "Compares options using maintainability, performance, and team fit.\nExplains why one choice is preferred in a real scenario.\nAcknowledges risks and mitigation.",
      },
      {
        question: "How do you handle performance issues and debugging under deadlines?",
        reference_answer:
          "Uses a structured triage and profiling approach.\nPrioritizes high-impact fixes with clear communication.\nValidates improvements with metrics.",
      },
    ],
    scenario: [
      {
        question: `You join a project late for ${safeTitle}. How do you ramp up quickly and deliver value in 2 weeks?`,
        reference_answer:
          "Starts with context gathering and risk mapping.\nDefines a small high-value deliverable for week one.\nAligns with stakeholders and shares daily progress.",
      },
      {
        question: "A critical dependency breaks before release. What is your recovery plan?",
        reference_answer:
          "Assesses impact quickly and defines fallback options.\nCoordinates owners and communicates timeline clearly.\nDocuments prevention actions after recovery.",
      },
      {
        question: "You receive ambiguous requirements from stakeholders. How do you proceed?",
        reference_answer:
          "Asks clarifying questions and confirms acceptance criteria.\nCreates a written summary of assumptions.\nSeeks quick sign-off before implementation.",
      },
      {
        question: "A high-priority bug impacts users in production. Describe your incident workflow.",
        reference_answer:
          "Follows incident triage, containment, and fix flow.\nKeeps stakeholders updated with clear status.\nCompletes post-incident learnings and follow-ups.",
      },
      {
        question: "How would you prioritize multiple urgent tasks from different teams?",
        reference_answer:
          "Uses business impact and deadline risk to rank tasks.\nNegotiates scope and sequence transparently.\nProtects quality by setting realistic commitments.",
      },
    ],
    behavioral: [
      {
        question: "Tell me about a time you handled conflict in a project team.",
        reference_answer:
          "Gives a real conflict example with context.\nShows active listening and resolution steps.\nHighlights team outcome and lesson learned.",
      },
      {
        question: "Describe a time you made a mistake and how you recovered.",
        reference_answer:
          "Takes ownership without blame shifting.\nExplains corrective actions and communication.\nShows prevention steps implemented later.",
      },
      {
        question: "How do you mentor or support teammates when deadlines are tight?",
        reference_answer:
          "Balances delivery with focused coaching.\nUses practical support like pairing or review checklists.\nDemonstrates improved team throughput.",
      },
      {
        question: "Share an example where you improved a process, not just a feature.",
        reference_answer:
          "Identifies bottleneck and baseline metrics.\nImplements process change with team adoption.\nReports measurable efficiency or quality gains.",
      },
      {
        question: "How do you handle feedback from peers or managers?",
        reference_answer:
          "Receives feedback with openness and specifics.\nActs on it with concrete behavior changes.\nFollows up to validate improvement.",
      },
    ],
    hr: [
      {
        question: "Why are you interested in this role?",
        reference_answer:
          "Connects motivation to role responsibilities.\nShows understanding of company context.\nKeeps reasons practical and role-specific.",
      },
      {
        question: "What type of work environment helps you perform your best?",
        reference_answer:
          "Describes collaboration style and expectations.\nMentions accountability and communication preferences.\nAligns preferences with role realities.",
      },
      {
        question: "What are your short-term and long-term career goals?",
        reference_answer:
          "Shares realistic growth goals with timeline.\nLinks goals to role opportunity and skill building.\nAvoids vague or contradictory plans.",
      },
      {
        question: "What notice period and joining timeline can you commit to?",
        reference_answer:
          "Provides clear availability date or range.\nExplains constraints transparently.\nShows reliability on commitment.",
      },
      {
        question: "Do you have any constraints around shift, location, or travel?",
        reference_answer:
          "States constraints clearly and early.\nConfirms flexibility where possible.\nEnsures expectations are aligned before next round.",
      },
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
  "technical": { "question": string, "reference_answer": string }[5],
  "scenario": { "question": string, "reference_answer": string }[5],
  "behavioral": { "question": string, "reference_answer": string }[5],
  "hr": { "question": string, "reference_answer": string }[5]
}
Reference answers must be concise recruiter-friendly key points (2-4 points), plain text only.
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
  const normalizeList = (items: any) =>
    (Array.isArray(items) ? items : [])
      .map((item) => {
        if (typeof item === "string") {
          return {
            question: item.trim(),
            reference_answer: "",
          };
        }
        return {
          question: String(item?.question || "").trim(),
          reference_answer: String(item?.reference_answer || "").trim(),
        };
      })
      .filter((item) => item.question);
  return {
    technical: normalizeList(parsed?.technical),
    scenario: normalizeList(parsed?.scenario),
    behavioral: normalizeList(parsed?.behavioral),
    hr: normalizeList(parsed?.hr),
  };
}

function normalizeQuestions(raw: any): QuestionPayload[] {
  const categories: QuestionCategory[] = ["technical", "scenario", "behavioral", "hr"];
  const rows: QuestionPayload[] = [];
  for (const category of categories) {
    const list = Array.isArray(raw?.[category]) ? raw[category] : [];
    list.slice(0, 10).forEach((item: any, idx: number) => {
      const question = String(item?.question || "").trim();
      const reference_answer = String(item?.reference_answer || "").trim();
      if (!question) return;
      rows.push({ category, question, reference_answer, sort_order: idx + 1 });
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
        `INSERT INTO job_interview_questions (job_id, category, question, sort_order, reference_answer)
         VALUES ($1, $2, $3, $4, $5)`,
      [jobId, q.category, q.question, q.sort_order ?? i + 1, q.reference_answer || null]
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
      `SELECT q.id, q.category, q.question, q.reference_answer, q.sort_order, q.created_at
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
        reference_answer: String(q?.reference_answer || "").trim(),
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
