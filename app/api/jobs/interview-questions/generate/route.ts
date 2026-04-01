import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function generateWithAI(input: { title: string; description: string; employmentType: string; skills: string }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const prompt = `Generate structured interview questions for the following job.
Return strict JSON:
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
  return {
    technical: Array.isArray(parsed?.technical) ? parsed.technical : [],
    scenario: Array.isArray(parsed?.scenario) ? parsed.scenario : [],
    behavioral: Array.isArray(parsed?.behavioral) ? parsed.behavioral : [],
    hr: Array.isArray(parsed?.hr) ? parsed.hr : [],
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
        .map((q, idx) => ({ category, question: String(q || "").trim(), sort_order: idx + 1 }))
        .filter((x) => x.question)
    );

    return NextResponse.json({ generated_mode, questions });
  } catch {
    return NextResponse.json({ error: "Failed to generate interview questions" }, { status: 500 });
  }
}
