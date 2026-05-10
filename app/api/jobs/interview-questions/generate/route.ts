import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function generateWithAI(input: { title: string; description: string; employmentType: string; skills: string }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const prompt = `Generate structured interview questions for the following job.
Return strict JSON:
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
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You generate practical interview questions." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error("OpenAI request failed");
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No AI response");
  const parsed = JSON.parse(text);
  const normalizeList = (items: any) =>
    (Array.isArray(items) ? items : [])
      .map((item) => {
        if (typeof item === "string") {
          return { question: item.trim(), reference_answer: "" };
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

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim();
    const employmentType = String(body?.employment_type || "").trim();
    const skills = String(body?.skills || "").trim();

    let generated = fallbackQuestions(title);
    let generated_mode: "AI" | "RULE_BASED" = "RULE_BASED";
    try {
      const ai = await generateWithAI({ title, description, employmentType, skills });
      if (ai) {
        generated = {
          technical: ai.technical.length ? ai.technical : generated.technical,
          scenario: ai.scenario.length ? ai.scenario : generated.scenario,
          behavioral: ai.behavioral.length ? ai.behavioral : generated.behavioral,
          hr: ai.hr.length ? ai.hr : generated.hr,
        };
        generated_mode = "AI";
      }
    } catch {
      // keep fallback
    }

    const questions = (["technical", "scenario", "behavioral", "hr"] as const).flatMap((category) =>
      (generated[category] || [])
        .map((q: any, idx) => ({
          category,
          question: String(q?.question || "").trim(),
          reference_answer: String(q?.reference_answer || "").trim(),
          sort_order: idx + 1,
        }))
        .filter((x) => x.question)
    );

    return NextResponse.json({ generated_mode, questions });
  } catch {
    return NextResponse.json({ error: "Failed to generate interview questions" }, { status: 500 });
  }
}
