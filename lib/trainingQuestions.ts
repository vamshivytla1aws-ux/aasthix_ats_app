export type TrainingQuestionCategory = "technical" | "project" | "behavioral" | "learning";

export type TrainingQuestion = {
  category: TrainingQuestionCategory;
  question: string;
  reference_answer: string;
  sort_order: number;
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
        sort_order: index + 1,
      } satisfies TrainingQuestion;
    })
    .filter((item) => item.question)
    .slice(0, 15);
}

async function generateWithAi(input: GenerateTrainingQuestionsInput): Promise<TrainingQuestion[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

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
        { role: "system", content: "You generate structured basic training interview questions from resumes." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No AI response");
  const parsed = JSON.parse(content);
  const questions = normalizeQuestions(parsed?.questions);
  return questions.length > 0 ? questions : null;
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
