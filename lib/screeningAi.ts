import { applyQuestionQualityControls } from "@/lib/screeningQuestionQuality";
import { normalizeEvaluatorScoreTo100 } from "@/lib/screeningScoreNormalize";

type ScreeningQuestion = {
  question_type: "technical" | "scenario";
  question_text: string;
  sort_order: number;
  difficulty?: "easy" | "standard" | "stretch";
};

export const SCREENING_EVAL_MODEL = "gpt-4o-mini";
export const SCREENING_GEN_MODEL = SCREENING_EVAL_MODEL;
export const SCREENING_RUBRIC_VERSION = "v1.2026-03";

type ScreeningEval = {
  score: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  quality_flag: "high-quality" | "average" | "weak";
  ai_raw: Record<string, unknown>;
};

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fallbackQuestions(jobTitle: string, skillsCsv: string) {
  const role = jobTitle || "this role";
  const skills = skillsCsv || "core role skills";
  const lines = [
    `Explain a recent project where you used ${skills}.`,
    `What are the most critical mistakes to avoid in ${role}?`,
    `Given ambiguous requirements, how would you deliver a first production-ready version?`,
    `Describe how you would debug a live issue affecting users and communicate updates.`,
    `A stakeholder asks for a risky shortcut to ship faster. What do you do?`,
    `How do you ensure maintainability and testing quality under time pressure?`,
  ];
  return lines.map((q, idx) => ({
    question_type: idx < 3 ? "technical" : "scenario",
    question_text: q,
    sort_order: idx + 1,
  })) as ScreeningQuestion[];
}

export async function generateScreeningQuestions(input: {
  jobTitle: string;
  jobDescription: string;
  skillsCsv: string;
  minCount?: number;
  maxCount?: number;
}): Promise<ScreeningQuestion[]> {
  const minCount = Math.max(5, Math.min(10, input.minCount ?? 5));
  const maxCount = Math.max(minCount, Math.min(10, input.maxCount ?? 8));
  const fallback = fallbackQuestions(input.jobTitle, input.skillsCsv);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return applyQuestionQualityControls(fallback.slice(0, maxCount), {
      minCount,
      maxCount,
      minTechnical: 2,
      minScenario: 2,
    });
  }

  const prompt = [
    "Generate screening questions for pre-interview assessment.",
    "Return strict JSON only in this shape:",
    `{"questions":[{"question_type":"technical|scenario","question_text":"string","difficulty":"easy|standard|stretch"}]}`,
    `Question count between ${minCount} and ${maxCount}.`,
    "Tone: professional, neutral, inclusive; no slang, no ALL CAPS emphasis, no jokes at candidate expense.",
    "Include a mix of difficulties: some easy recall, some standard application, some stretch scenario thinking.",
    "Avoid trivia and avoid impossible whiteboard tasks.",
    "Focus on practical, job-relevant skill assessment.",
    `Job title: ${input.jobTitle || "N/A"}`,
    `Skills: ${input.skillsCsv || "N/A"}`,
    `Job description: ${input.jobDescription || "N/A"}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SCREENING_GEN_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You generate recruiter-safe screening content." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error("AI question generation failed");
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("Empty AI response");
    const parsed = safeJsonParse(text) as any;
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const normalized = questions
      .map((q: any, idx: number) => {
        const type = String(q?.question_type || "").toLowerCase();
        const question_type = type === "scenario" ? "scenario" : "technical";
        const question_text = String(q?.question_text || "").trim();
        const d = String(q?.difficulty || "").toLowerCase();
        const difficulty =
          d === "easy" || d === "standard" || d === "stretch" ? d : undefined;
        return { question_type, question_text, sort_order: idx + 1, difficulty };
      })
      .filter((q: ScreeningQuestion) => q.question_text.length > 0)
      .slice(0, maxCount);
    const base = normalized.length >= minCount ? normalized : fallback.slice(0, maxCount);
    return applyQuestionQualityControls(base, { minCount, maxCount, minTechnical: 2, minScenario: 2 });
  } catch {
    return applyQuestionQualityControls(fallback.slice(0, maxCount), {
      minCount,
      maxCount,
      minTechnical: 2,
      minScenario: 2,
    });
  }
}

export async function evaluateScreeningAnswers(input: {
  jobTitle: string;
  jobDescription: string;
  skillsCsv: string;
  questions: Array<{ question_type: string; question_text: string; answer_text: string }>;
}): Promise<ScreeningEval> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback: ScreeningEval = {
    score: 65,
    feedback: "Evaluation generated using fallback logic. Please review answers manually.",
    strengths: "Candidate submitted complete answers and attempted all questions.",
    weaknesses: "Depth and specificity vary; manual recruiter review recommended.",
    quality_flag: "average",
    ai_raw: { mode: "fallback" },
  };
  if (!apiKey) {
    return {
      ...fallback,
      ai_raw: { ...fallback.ai_raw, rubric_version: SCREENING_RUBRIC_VERSION, model: "fallback" },
    };
  }

  const prompt = [
    "Evaluate candidate screening answers for recruiter support.",
    "Do not infer AI usage and do not mention AI detection.",
    "Return strict JSON with keys:",
    `{"score":number,"feedback":string,"strengths":string,"weaknesses":string,"quality_flag":"high-quality|average|weak"}`,
    `Rubric version: ${SCREENING_RUBRIC_VERSION}.`,
    "IMPORTANT: score MUST be a single integer from 0 to 100 inclusive (not 0–10, not a decimal 0–1). Example: strong pass ≈ 80–95, borderline ≈ 65–72, weak ≈ 30–55.",
    "Scoring guideline: practical correctness, relevance, clarity, decision-making.",
    `Job title: ${input.jobTitle || "N/A"}`,
    `Skills: ${input.skillsCsv || "N/A"}`,
    `Job description: ${input.jobDescription || "N/A"}`,
    `Q&A: ${JSON.stringify(input.questions).slice(0, 12000)}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SCREENING_EVAL_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an ATS screening evaluator. Always output score as an integer 0–100 (full range), never 0–10.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error("AI evaluation failed");
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("Empty AI response");
    const parsed = safeJsonParse(text) as any;
    const rawScore = Number(parsed?.score);
    const qualityFromModel =
      parsed?.quality_flag === "high-quality" || parsed?.quality_flag === "average" || parsed?.quality_flag === "weak"
        ? parsed.quality_flag
        : undefined;
    const score = normalizeEvaluatorScoreTo100(rawScore, qualityFromModel);
    const qualityFlag =
      qualityFromModel ??
      (score >= 80 ? "high-quality" : score >= 60 ? "average" : "weak");
    return {
      score,
      feedback: String(parsed?.feedback || "").trim() || fallback.feedback,
      strengths: String(parsed?.strengths || "").trim() || fallback.strengths,
      weaknesses: String(parsed?.weaknesses || "").trim() || fallback.weaknesses,
      quality_flag: qualityFlag,
      ai_raw: {
        ...(parsed && typeof parsed === "object" ? parsed : {}),
        rubric_version: SCREENING_RUBRIC_VERSION,
        model: SCREENING_EVAL_MODEL,
      },
    };
  } catch {
    return {
      ...fallback,
      ai_raw: { ...fallback.ai_raw, rubric_version: SCREENING_RUBRIC_VERSION, model: "error_fallback" },
    };
  }
}
