export type TrainingQuestionCategory = "technical" | "project" | "behavioral" | "learning";

export type TrainingQuestion = {
  category: TrainingQuestionCategory;
  question: string;
  reference_answer: string;
  sort_order: number;
};

export type TrainingAnswer = {
  category: TrainingQuestionCategory;
  question: string;
  answer: string;
  sort_order: number;
};

export type TrainingAnswerAnalysis = {
  category: TrainingQuestionCategory;
  question: string;
  answer: string;
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  sort_order: number;
};

export type TrainingAnswerAnalysisResult = {
  analysis_mode: "AI" | "RULE_BASED";
  answer_analysis_status: "analyzed" | "fallback";
  answer_analysis_error: string | null;
  overall_answer_score: number;
  answer_summary: string;
  answer_analyses: TrainingAnswerAnalysis[];
};

type GenerateTrainingQuestionsInput = {
  fullName?: string | null;
  resumeText?: string | null;
};

type GenerateTrainingQuestionsResult = {
  generated_mode: "AI" | "RULE_BASED";
  question_generation_status: "generated" | "fallback";
  question_generation_error: string | null;
  questions: TrainingQuestion[];
};

type AnalyzeTrainingAnswersInput = {
  fullName?: string | null;
  resumeText?: string | null;
  questions: TrainingQuestion[];
  answers: TrainingAnswer[];
};

const QUESTION_TARGET_COUNT = 12;

function fallbackQuestions(fullName?: string | null): TrainingQuestion[] {
  const name = fullName?.trim() || "the trainee";
  const groups: Array<{ category: TrainingQuestionCategory; items: Array<{ question: string; reference_answer: string }> }> = [
    {
      category: "technical",
      items: [
        {
          question: `Walk me through the core technical skills you mention in your resume, ${name}.`,
          reference_answer: "Explains the main stack clearly. Distinguishes hands-on work from exposure only. Uses recent examples.",
        },
        {
          question: "Which project in your resume best demonstrates your strongest technical ability, and why?",
          reference_answer: "Chooses one project with clear scope. Explains responsibilities and tools used. Mentions measurable outcome.",
        },
        {
          question: "How do you debug a technical issue when you do not know the root cause initially?",
          reference_answer: "Uses a step-by-step debugging method. Starts with reproduction and logging. Validates the final fix.",
        },
      ],
    },
    {
      category: "project",
      items: [
        {
          question: "Pick one resume project and explain the problem statement, your role, and the final result.",
          reference_answer: "States business or user problem. Describes personal contribution, not only team output. Ends with impact or learning.",
        },
        {
          question: "What was the most difficult part of one project you worked on, and how did you handle it?",
          reference_answer: "Describes a real challenge. Explains reasoning and trade-offs. Shows ownership in the resolution.",
        },
        {
          question: "If you had to improve one project from your resume today, what would you change first?",
          reference_answer: "Identifies a realistic weakness. Suggests a concrete improvement. Shows reflective thinking.",
        },
      ],
    },
    {
      category: "behavioral",
      items: [
        {
          question: "Tell me about a time you worked with others to finish a task under a deadline.",
          reference_answer: "Shows collaboration and communication. Explains personal role clearly. Mentions the final outcome.",
        },
        {
          question: "Describe a mistake or setback during a project and what you learned from it.",
          reference_answer: "Takes ownership. Explains corrective action. Converts the experience into a clear learning.",
        },
        {
          question: "How do you ask for help or clarification when requirements are not clear?",
          reference_answer: "Uses practical communication steps. Clarifies assumptions early. Prevents avoidable rework.",
        },
      ],
    },
    {
      category: "learning",
      items: [
        {
          question: "How do you learn a new technology or concept that is required for a project?",
          reference_answer: "Explains a structured learning approach. Uses small experiments or examples. Connects learning back to delivery.",
        },
        {
          question: "What kind of role or technical area are you trying to grow into next?",
          reference_answer: "Gives a realistic growth direction. Aligns it with present skills. Shows curiosity and intent.",
        },
        {
          question: "Which part of your resume best shows your willingness to learn or improve quickly?",
          reference_answer: "Points to a concrete example. Explains what was learned. Shows how that learning was applied.",
        },
      ],
    },
  ];

  return groups.flatMap((group) =>
    group.items.map((item, index) => ({
      category: group.category,
      question: item.question,
      reference_answer: item.reference_answer,
      sort_order: index + 1,
    }))
  );
}

function normalizeCategory(raw: string): TrainingQuestionCategory {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "technical" || value === "project" || value === "behavioral" || value === "learning") return value;
  return "technical";
}

function normalizeQuestions(items: unknown): TrainingQuestion[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const question = String(row?.question || "").trim();
      const reference_answer = String(row?.reference_answer || "").trim();
      return {
        category: normalizeCategory(String(row?.category || "")),
        question,
        reference_answer,
        sort_order: Number(row?.sort_order) || index + 1,
      } satisfies TrainingQuestion;
    })
    .filter((item) => item.question)
    .slice(0, 15);
}

function normalizeAnswerAnalyses(items: unknown): TrainingAnswerAnalysis[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const question = String(row?.question || "").trim();
      const answer = String(row?.answer || "").trim();
      if (!question) return null;
      return {
        category: normalizeCategory(String(row?.category || "")),
        question,
        answer,
        score: Math.max(0, Math.min(100, Number(row?.score) || 0)),
        summary: String(row?.summary || "").trim(),
        strengths: Array.isArray(row?.strengths) ? row.strengths.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3) : [],
        improvements: Array.isArray(row?.improvements) ? row.improvements.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3) : [],
        sort_order: Number(row?.sort_order) || index + 1,
      } satisfies TrainingAnswerAnalysis;
    })
    .filter((item): item is TrainingAnswerAnalysis => Boolean(item));
}

function buildFallbackAnalysisRow(
  question: TrainingQuestion | undefined,
  answer: TrainingAnswer,
  index: number
): TrainingAnswerAnalysis {
  const answerText = answer.answer.trim();
  const wordCount = answerText ? answerText.split(/\s+/).filter(Boolean).length : 0;
  let score = 20;
  if (wordCount >= 12) score += 25;
  if (wordCount >= 30) score += 20;
  if (wordCount >= 60) score += 10;

  const reference = question?.reference_answer || "";
  const referenceWords = reference
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4);
  const hits = referenceWords.filter((word) => answerText.toLowerCase().includes(word));
  score += Math.min(25, hits.length * 6);
  if (!answerText) score = 0;

  const strengths = [];
  if (wordCount >= 20) strengths.push("Gives a reasonably detailed response.");
  if (hits.length >= 2) strengths.push("Touches expected evaluation points.");
  if (/project|built|implemented|worked|designed|resolved|improved/i.test(answerText)) {
    strengths.push("Uses practical experience language instead of only theory.");
  }

  const improvements = [];
  if (wordCount < 12) improvements.push("Needs more detail and a clearer explanation.");
  if (hits.length === 0) improvements.push("Should connect the answer more directly to the question intent.");
  if (!/\b(i|my|we)\b/i.test(answerText)) improvements.push("Should clarify the candidate's own contribution or viewpoint.");

  return {
    category: answer.category,
    question: answer.question,
    answer: answer.answer,
    score: Math.max(0, Math.min(100, score)),
    summary: answerText
      ? wordCount >= 20
        ? "Reasonable answer, but recruiter review is still recommended."
        : "Short answer with limited evidence."
      : "No answer was provided.",
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    sort_order: answer.sort_order || question?.sort_order || index + 1,
  };
}

function completeAnswerAnalyses(
  questions: TrainingQuestion[],
  answers: TrainingAnswer[],
  analyses: TrainingAnswerAnalysis[]
): TrainingAnswerAnalysis[] {
  return answers.map((answer, index) => {
    const question =
      questions.find((item) => item.sort_order === answer.sort_order) ||
      questions.find((item) => item.question === answer.question) ||
      questions[index];
    const matching =
      analyses.find((item) => item.sort_order === answer.sort_order) ||
      analyses.find((item) => item.question === answer.question);
    if (matching) {
      return {
        ...matching,
        category: matching.category || answer.category || question?.category || "technical",
        question: matching.question || answer.question || question?.question || `Question ${index + 1}`,
        answer: answer.answer,
        sort_order: answer.sort_order || matching.sort_order || question?.sort_order || index + 1,
      };
    }
    return buildFallbackAnalysisRow(question, answer, index);
  });
}

async function callOpenAiJson(prompt: string, system: string, timeoutMs: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithAi(input: GenerateTrainingQuestionsInput): Promise<TrainingQuestion[] | null> {
  const prompt = `Generate ${QUESTION_TARGET_COUNT} basic trainee interview questions from this resume.
Return strict JSON in this shape:
{
  "questions": [
    {
      "category": "technical" | "project" | "behavioral" | "learning",
      "question": string,
      "reference_answer": string
    }
  ]
}

Rules:
- Use the resume as the primary source.
- Questions must be basic to early-career level.
- Cover fundamentals, project walkthrough, communication, and learning mindset.
- Keep reference answers short, recruiter-friendly, plain text only.
- Do not invent seniority that is not in the resume.

Candidate name: ${input.fullName || "N/A"}
Resume:
${String(input.resumeText || "").slice(0, 18000)}`;

  const parsed = await callOpenAiJson(
    prompt,
    "You generate structured basic training interview questions from resumes.",
    15_000
  );
  const questions = normalizeQuestions(parsed?.questions);
  return questions.length > 0 ? questions : null;
}

function fallbackAnalysis(input: AnalyzeTrainingAnswersInput): TrainingAnswerAnalysisResult {
  const analyses = completeAnswerAnalyses(input.questions, input.answers, []);

  const overallPercent = analyses.length
    ? Math.round(analyses.reduce((sum, item) => sum + item.score, 0) / analyses.length)
    : 0;
  const overall = Math.max(0, Math.min(15, Math.round((overallPercent / 100) * 15)));

  return {
    analysis_mode: "RULE_BASED",
    answer_analysis_status: "fallback",
    answer_analysis_error: "AI answer analysis was unavailable, so a rule-based review summary was used.",
    overall_answer_score: overall,
    answer_summary:
      overall >= 11
        ? "The trainee responses look solid overall, though a recruiter should still review the details."
        : overall >= 8
          ? "The trainee shows partial understanding, with several answers needing deeper explanation."
          : "The trainee responses are currently weak or incomplete and need follow-up.",
    answer_analyses: analyses,
  };
}

async function analyzeWithAi(input: AnalyzeTrainingAnswersInput): Promise<TrainingAnswerAnalysisResult | null> {
  const prompt = `Evaluate these trainee answers against the generated questions and the resume context.
Return strict JSON in this shape:
{
  "overall_answer_score": number,
  "answer_summary": string,
  "answer_analyses": [
    {
      "category": "technical" | "project" | "behavioral" | "learning",
      "question": string,
      "answer": string,
      "score": number,
      "summary": string,
      "strengths": string[],
      "improvements": string[]
    }
  ]
}

Rules:
- Score each answer from 0 to 100.
- Set overall_answer_score as a whole-number final mark out of 15.
- Be strict but fair.
- Evaluate the actual answer text, not just the resume.
- Use the reference answer only as internal recruiter guidance, never copy it verbatim.
- Strengths and improvements must be concise.
- If an answer is blank or too short, score it low and say why.
- Keep the overall summary recruiter-friendly.

Candidate name: ${input.fullName || "N/A"}
Resume context:
${String(input.resumeText || "").slice(0, 12000)}

Questions and internal guidance:
${JSON.stringify(
  input.questions.map((question) => ({
    category: question.category,
    question: question.question,
    reference_answer: question.reference_answer,
    sort_order: question.sort_order,
  }))
)}

Trainee answers:
${JSON.stringify(
  input.answers.map((answer) => ({
    category: answer.category,
    question: answer.question,
    answer: answer.answer,
    sort_order: answer.sort_order,
  }))
)}
`;

  const parsed = await callOpenAiJson(
    prompt,
    "You evaluate trainee interview answers using resume context and internal recruiter guidance.",
    20_000
  );
  const analyses = completeAnswerAnalyses(input.questions, input.answers, normalizeAnswerAnalyses(parsed?.answer_analyses));
  if (!analyses.length) return null;
  return {
    analysis_mode: "AI",
    answer_analysis_status: "analyzed",
    answer_analysis_error: null,
    overall_answer_score: Math.max(0, Math.min(15, Number(parsed?.overall_answer_score) || 0)),
    answer_summary: String(parsed?.answer_summary || "").trim(),
    answer_analyses: analyses,
  };
}

export function normalizeTrainingAnswers(raw: unknown): TrainingAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const question = String(row?.question || "").trim();
      if (!question) return null;
      return {
        category: normalizeCategory(String(row?.category || "")),
        question,
        answer: String(row?.answer || "").trim(),
        sort_order: Number(row?.sort_order) || index + 1,
      } satisfies TrainingAnswer;
    })
    .filter((item): item is TrainingAnswer => Boolean(item))
    .slice(0, 15);
}

export function normalizeTrainingAnswerAnalyses(raw: unknown): TrainingAnswerAnalysis[] {
  return normalizeAnswerAnalyses(raw);
}

export async function generateTrainingQuestions(
  input: GenerateTrainingQuestionsInput
): Promise<GenerateTrainingQuestionsResult> {
  const fallback = fallbackQuestions(input.fullName);
  try {
    if (!input.resumeText || input.resumeText.trim().length < 80) {
      return {
        generated_mode: "RULE_BASED",
        question_generation_status: "fallback",
        question_generation_error: "Resume text was too short for AI-driven question generation.",
        questions: fallback,
      };
    }
    const ai = await generateWithAi(input);
    if (!ai || ai.length < 10) {
      return {
        generated_mode: "RULE_BASED",
        question_generation_status: "fallback",
        question_generation_error: "AI question generation returned insufficient output.",
        questions: fallback,
      };
    }
    return {
      generated_mode: "AI",
      question_generation_status: "generated",
      question_generation_error: null,
      questions: ai,
    };
  } catch (error) {
    return {
      generated_mode: "RULE_BASED",
      question_generation_status: "fallback",
      question_generation_error: error instanceof Error ? error.message : "Failed to generate questions",
      questions: fallback,
    };
  }
}

export async function analyzeTrainingAnswers(
  input: AnalyzeTrainingAnswersInput
): Promise<TrainingAnswerAnalysisResult> {
  const answers = input.answers
    .map((answer, index) => ({
      category: normalizeCategory(answer.category),
      question: String(answer.question || "").trim(),
      answer: String(answer.answer || "").trim(),
      sort_order: Number(answer.sort_order) || index + 1,
    }))
    .filter((answer) => answer.question);

  if (!answers.length) {
    return fallbackAnalysis({ ...input, answers: [] });
  }

  try {
    const ai = await analyzeWithAi({ ...input, answers });
    if (!ai) {
      return fallbackAnalysis({ ...input, answers });
    }
    return ai;
  } catch {
    return fallbackAnalysis({ ...input, answers });
  }
}
