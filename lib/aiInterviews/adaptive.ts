import { z } from "zod";
import { aiInterviewConfig } from "@/lib/aiInterviews/config";
import { withCostControlledModel } from "@/lib/ai/modelConfig";

export const adaptiveDepths = [
  "FOUNDATION",
  "IMPLEMENTATION",
  "ADVANCED",
  "ARCHITECTURE",
] as const;
export type AdaptiveDepth = (typeof adaptiveDepths)[number];

const priorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const sourceTypes = [
  "JD_SKILL",
  "JD_RESPONSIBILITY",
  "RESUME_PROJECT",
  "RESUME_TECHNOLOGY",
  "PREVIOUS_ANSWER",
  "KNOWLEDGE_GAP",
  "SCENARIO_BASED",
  "FALLBACK",
] as const;
const strategies = [
  "CLARIFY_CURRENT_ANSWER",
  "VERIFY_PROJECT_CLAIM",
  "DEEPEN_TECHNICAL_TOPIC",
  "TEST_TROUBLESHOOTING",
  "TEST_DESIGN_DECISION",
  "TEST_PRODUCTION_EXPERIENCE",
  "TEST_MANDATORY_JD_SKILL",
  "TEST_MISSING_JD_SKILL",
  "MOVE_TO_NEXT_PROJECT",
  "ASK_SCENARIO",
  "FINAL_SUMMARY_QUESTION",
] as const;

const questionSchema = z.object({
  strategy: z.enum(strategies),
  question: z.string().trim().min(12).max(1200),
  skill: z.string().trim().min(1).max(150),
  projectName: z.string().trim().max(300).nullable().default(null),
  difficulty: z.enum(adaptiveDepths),
  sourceType: z.enum(sourceTypes),
  sourceReference: z.string().trim().min(2).max(600),
  reasonForAsking: z.string().trim().min(3).max(800),
  expectedSignals: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
  maximumAnswerSeconds: z.number().int().min(30).max(600).default(180),
});

const contextSchema = z.object({
  resumeSource: z
    .enum(["UPLOADED_RESUME", "STORED_RESUME_TEXT", "NONE"])
    .default("STORED_RESUME_TEXT"),
  jobContext: z.object({
    title: z.string(),
    minimumExperienceYears: z.number().nullable().default(null),
    preferredExperienceYears: z.number().nullable().default(null),
    mandatorySkills: z
      .array(
        z.object({
          name: z.string(),
          priority: z.enum(priorities),
          requiredDepth: z.enum(adaptiveDepths),
        }),
      )
      .default([]),
    optionalSkills: z.array(z.string()).default([]),
    responsibilities: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    domain: z.array(z.string()).default([]),
    leadershipExpectations: z.array(z.string()).default([]),
  }),
  candidateContext: z.object({
    totalExperienceYears: z.number().nullable().default(null),
    relevantExperienceYears: z.number().nullable().default(null),
    currentRole: z.string().default(""),
    skills: z.array(z.string()).default([]),
    projects: z
      .array(
        z.object({
          name: z.string(),
          duration: z.string().default(""),
          domain: z.string().default(""),
          role: z.string().default(""),
          responsibilities: z.array(z.string()).default([]),
          technologies: z.array(z.string()).default([]),
          achievements: z.array(z.string()).default([]),
        }),
      )
      .default([]),
  }),
  skillMatch: z
    .array(
      z.object({
        skill: z.string(),
        requiredByJob: z.boolean(),
        foundInResume: z.boolean(),
        projectEvidenceAvailable: z.boolean(),
        priority: z.enum(priorities),
      }),
    )
    .default([]),
  sourceQuality: z.enum(["FULL", "PARTIAL", "LIMITED"]),
});

const answerAnalysisSchema = z.object({
  answerSummary: z.string().default(""),
  score: z.number().min(0).max(10),
  technicalAccuracy: z.number().min(0).max(10),
  practicalEvidence: z.number().min(0).max(10),
  depth: z.number().min(0).max(10),
  clarity: z.number().min(0).max(10),
  answeredExpectedSignals: z.array(z.string()).default([]),
  missingExpectedSignals: z.array(z.string()).default([]),
  vagueClaims: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  newRelevantTopics: z.array(z.string()).default([]),
  claimsRequiringVerification: z.array(z.string()).default([]),
  recommendedNextStrategy: z.enum(strategies),
  recommendedDifficulty: z.enum(adaptiveDepths),
});

const turnSchema = z.object({
  analysis: answerAnalysisSchema,
  nextQuestion: questionSchema,
});

export type AdaptiveQuestion = z.output<typeof questionSchema>;
export type AdaptiveContext = z.output<typeof contextSchema>;
export type AdaptiveAnswerAnalysis = z.output<typeof answerAnalysisSchema>;
export type AdaptiveConfig = {
  maxQuestions: number;
  projectQuestionsEnabled: boolean;
  minProjectQuestions: number;
  maxFollowUpsPerTopic: number;
  scenarioPercentage: number;
  codingEnabled: boolean;
  behavioralEnabled: boolean;
  allowFundamentalsForSenior: boolean;
  recruiterExperienceOverride: number | null;
  windowStart?: string;
};
export type AdaptiveState = {
  currentDifficulty: AdaptiveDepth;
  questionsAsked: number;
  maximumQuestions: number;
  consecutiveStrongAnswers: number;
  consecutiveWeakAnswers: number;
  skillsCovered: Array<{
    skill: string;
    coverage: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
    questionsAsked: number;
  }>;
  skillsRemaining: string[];
  projectsCovered: string[];
  unverifiedClaims: string[];
  previousAnswerSummary: string;
  previousAnswerScore: number | null;
  completionReady?: boolean;
  fallbackQuestion: AdaptiveQuestion;
  strategyCounts?: {
    mandatory: number;
    project: number;
    scenario: number;
    followUp: number;
  };
  topicFollowUps?: Record<string, number>;
};

async function structuredRequest<S extends z.ZodTypeAny>(
  system: string,
  prompt: string,
  schema: S,
): Promise<z.output<S>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            withCostControlledModel(
              {
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: prompt },
                ],
              },
              aiInterviewConfig.model,
            ),
          ),
        },
      );
      if (!response.ok)
        throw new Error(`Adaptive interview model failed (${response.status})`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string")
        throw new Error("Adaptive interview model returned no content");
      return schema.parse(JSON.parse(content));
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Adaptive interview model failed");
}

export function depthFromExperience(
  years: number | null | undefined,
): AdaptiveDepth {
  if (years == null || years < 1) return "FOUNDATION";
  if (years < 3) return "IMPLEMENTATION";
  if (years < 5) return "ADVANCED";
  return "ARCHITECTURE";
}

function dbDifficulty(
  depth: AdaptiveDepth,
): "BEGINNER" | "INTERMEDIATE" | "ADVANCED" {
  return depth === "FOUNDATION"
    ? "BEGINNER"
    : depth === "IMPLEMENTATION"
      ? "INTERMEDIATE"
      : "ADVANCED";
}

export function toStoredQuestion(question: AdaptiveQuestion) {
  return { ...question, dbDifficulty: dbDifficulty(question.difficulty) };
}

function words(text: string) {
  return Array.from(
    new Set(
      (text.toLowerCase().match(/[a-z][a-z0-9.+#/-]{2,}/g) || []).filter(
        (word) =>
          ![
            "and",
            "the",
            "with",
            "from",
            "that",
            "this",
            "have",
            "your",
            "will",
          ].includes(word),
      ),
    ),
  );
}

function fallbackContext(input: {
  title: string;
  jd: string;
  resume: string;
  skills: string[];
  experienceOverride: number | null;
}): AdaptiveContext {
  const jdWords = words(`${input.skills.join(" ")} ${input.jd}`).slice(0, 25);
  const resumeWords = new Set(words(input.resume));
  const mandatory = (
    input.skills.length ? input.skills : jdWords.slice(0, 8)
  ).map((name, index) => ({
    name,
    priority: (index < 3 ? "CRITICAL" : "HIGH") as "CRITICAL" | "HIGH",
    requiredDepth: depthFromExperience(input.experienceOverride),
  }));
  return {
    resumeSource: "STORED_RESUME_TEXT",
    jobContext: {
      title: input.title,
      minimumExperienceYears: input.experienceOverride,
      preferredExperienceYears: null,
      mandatorySkills: mandatory,
      optionalSkills: [],
      responsibilities: [],
      tools: [],
      domain: [],
      leadershipExpectations: [],
    },
    candidateContext: {
      totalExperienceYears: input.experienceOverride,
      relevantExperienceYears: input.experienceOverride,
      currentRole: "",
      skills: Array.from(resumeWords).slice(0, 40),
      projects: [],
    },
    skillMatch: mandatory.map((skill) => ({
      skill: skill.name,
      requiredByJob: true,
      foundInResume: resumeWords.has(skill.name.toLowerCase()),
      projectEvidenceAvailable: false,
      priority: skill.priority,
    })),
    sourceQuality: input.resume.length >= 1000 ? "PARTIAL" : "LIMITED",
  };
}

export async function buildAdaptiveInterviewPlan(input: {
  title: string;
  jd: string;
  resume: string;
  skills: string[];
  config: AdaptiveConfig;
  sourceQuality?: "FULL" | "PARTIAL" | "LIMITED";
  resumeSource?: "UPLOADED_RESUME" | "STORED_RESUME_TEXT" | "NONE";
}) {
  let context: AdaptiveContext;
  try {
    context = await structuredRequest(
      "Extract only evidence present in the supplied JD and resume. Never invent projects, responsibilities, experience, or technologies. Return strict JSON.",
      `Build the normalized interview context matching this shape: ${JSON.stringify({ jobContext: { title: "", minimumExperienceYears: null, preferredExperienceYears: null, mandatorySkills: [{ name: "", priority: "CRITICAL", requiredDepth: "ADVANCED" }], optionalSkills: [], responsibilities: [], tools: [], domain: [], leadershipExpectations: [] }, candidateContext: { totalExperienceYears: null, relevantExperienceYears: null, currentRole: "", skills: [], projects: [{ name: "", duration: "", domain: "", role: "", responsibilities: [], technologies: [], achievements: [] }] }, skillMatch: [{ skill: "", requiredByJob: true, foundInResume: true, projectEvidenceAvailable: true, priority: "HIGH" }], sourceQuality: "FULL" })}\nRecruiter mandatory skills: ${input.skills.join(", ")}\nJD:\n${input.jd.slice(0, 18000)}\nResume:\n${input.resume.slice(0, 18000)}`,
      contextSchema,
    );
  } catch {
    context = fallbackContext({
      title: input.title,
      jd: input.jd,
      resume: input.resume,
      skills: input.skills,
      experienceOverride: input.config.recruiterExperienceOverride,
    });
  }
  if (input.sourceQuality) context.sourceQuality = input.sourceQuality;
  if (input.resumeSource) context.resumeSource = input.resumeSource;
  if (input.config.recruiterExperienceOverride != null)
    context.candidateContext.relevantExperienceYears =
      input.config.recruiterExperienceOverride;
  const experience =
    context.candidateContext.relevantExperienceYears ??
    context.candidateContext.totalExperienceYears;
  const depth = depthFromExperience(experience);
  const firstSkill =
    context.jobContext.mandatorySkills[0]?.name ||
    input.skills[0] ||
    input.title;
  const project = input.config.projectQuestionsEnabled
    ? context.candidateContext.projects[0]
    : null;
  const opening: AdaptiveQuestion = project
    ? {
        strategy: "VERIFY_PROJECT_CLAIM",
        question: `In your ${project.name} project, what problem were you solving, what did you personally implement, and how did you apply ${firstSkill}?`,
        skill: firstSkill,
        projectName: project.name,
        difficulty: depth,
        sourceType: "RESUME_PROJECT",
        sourceReference: `Project: ${project.name}`,
        reasonForAsking:
          "Validate relevant project ownership against a mandatory job skill.",
        expectedSignals: [
          "Personal contribution",
          "Technical implementation",
          "Project outcome",
        ],
        maximumAnswerSeconds: 180,
      }
    : {
        strategy: "TEST_MANDATORY_JD_SKILL",
        question: `Describe your most recent project relevant to this role, including your personal responsibilities, technology stack, and how you used ${firstSkill}.`,
        skill: firstSkill,
        projectName: null,
        difficulty: depth,
        sourceType: "JD_SKILL",
        sourceReference: firstSkill,
        reasonForAsking:
          "Establish relevant project evidence for a mandatory job skill.",
        expectedSignals: ["Relevant project", "Personal ownership", firstSkill],
        maximumAnswerSeconds: 180,
      };
  const fallbackQuestion: AdaptiveQuestion = {
    strategy: "TEST_TROUBLESHOOTING",
    question: `Describe a practical problem you solved using ${firstSkill}, including how you diagnosed it and verified the result.`,
    skill: firstSkill,
    projectName: null,
    difficulty: depth,
    sourceType: "FALLBACK",
    sourceReference: firstSkill,
    reasonForAsking:
      "Emergency evidence-based fallback for the current mandatory skill.",
    expectedSignals: [
      "Problem",
      "Diagnosis",
      "Implementation",
      "Verified result",
    ],
    maximumAnswerSeconds: 180,
  };
  const coverage = context.jobContext.mandatorySkills.map((skill) => ({
    skill: skill.name,
    coverage: 0,
    confidence: "LOW" as const,
    questionsAsked: 0,
  }));
  const state: AdaptiveState = {
    currentDifficulty: depth,
    questionsAsked: 1,
    maximumQuestions: input.config.maxQuestions,
    consecutiveStrongAnswers: 0,
    consecutiveWeakAnswers: 0,
    skillsCovered: coverage,
    skillsRemaining: coverage.map((item) => item.skill),
    projectsCovered: [],
    unverifiedClaims: [],
    previousAnswerSummary: "",
    previousAnswerScore: null,
    fallbackQuestion,
    strategyCounts: {
      mandatory: project ? 0 : 1,
      project: project ? 1 : 0,
      scenario: 0,
      followUp: 0,
    },
    topicFollowUps: {},
  };
  return {
    context,
    opening,
    state,
    coverage,
    model:
      context.sourceQuality === "LIMITED"
        ? "rule_based"
        : aiInterviewConfig.model,
  };
}

function questionIsRelevant(
  question: AdaptiveQuestion,
  context: AdaptiveContext,
  previousAnswer: string,
) {
  const allowed = new Set([
    ...context.jobContext.mandatorySkills.map((item) =>
      item.name.toLowerCase(),
    ),
    ...context.jobContext.optionalSkills.map((item) => item.toLowerCase()),
    ...context.jobContext.tools.map((item) => item.toLowerCase()),
    ...context.candidateContext.projects
      .flatMap((item) => [item.name, ...item.technologies])
      .map((item) => item.toLowerCase()),
  ]);
  if (
    question.sourceType === "PREVIOUS_ANSWER" ||
    question.sourceType === "KNOWLEDGE_GAP"
  )
    return previousAnswer
      .toLowerCase()
      .includes(question.sourceReference.toLowerCase().split(" ")[0]);
  if (
    question.sourceType === "SCENARIO_BASED" ||
    question.sourceType === "FALLBACK" ||
    question.sourceType === "JD_RESPONSIBILITY"
  )
    return true;
  return (
    allowed.has(question.skill.toLowerCase()) ||
    Array.from(allowed).some((item) =>
      question.sourceReference.toLowerCase().includes(item),
    )
  );
}

function changeDepth(depth: AdaptiveDepth, direction: -1 | 1): AdaptiveDepth {
  const index = adaptiveDepths.indexOf(depth);
  return adaptiveDepths[
    Math.max(0, Math.min(adaptiveDepths.length - 1, index + direction))
  ];
}

export function updateAdaptiveState(
  state: AdaptiveState,
  analysis: AdaptiveAnswerAnalysis,
  skill: string,
  projectName?: string | null,
  strategy?: string | null,
): AdaptiveState {
  const strong = analysis.score >= 7;
  const weak = analysis.score < 4;
  const strongCount = strong ? state.consecutiveStrongAnswers + 1 : 0;
  const weakCount = weak ? state.consecutiveWeakAnswers + 1 : 0;
  const nextDifficulty =
    strongCount >= 2
      ? changeDepth(state.currentDifficulty, 1)
      : weakCount >= 2
        ? changeDepth(state.currentDifficulty, -1)
        : state.currentDifficulty;
  const skillsCovered = state.skillsCovered.map((item) =>
    item.skill.toLowerCase() === skill.toLowerCase()
      ? {
          ...item,
          questionsAsked: item.questionsAsked + 1,
          coverage: Math.max(item.coverage, Math.round(analysis.score * 10)),
          confidence:
            analysis.score >= 7
              ? ("HIGH" as const)
              : analysis.score >= 4
                ? ("MEDIUM" as const)
                : ("LOW" as const),
        }
      : item,
  );
  const counts = {
    mandatory: 0,
    project: 0,
    scenario: 0,
    followUp: 0,
    ...state.strategyCounts,
  };
  const topicFollowUps = { ...(state.topicFollowUps || {}) };
  if (strategy === "ASK_SCENARIO" || strategy === "TEST_TROUBLESHOOTING")
    counts.scenario += 1;
  else if (
    strategy === "VERIFY_PROJECT_CLAIM" ||
    strategy === "MOVE_TO_NEXT_PROJECT"
  )
    counts.project += 1;
  else if (
    strategy === "CLARIFY_CURRENT_ANSWER" ||
    strategy === "DEEPEN_TECHNICAL_TOPIC"
  ) {
    counts.followUp += 1;
    topicFollowUps[skill] = (topicFollowUps[skill] || 0) + 1;
  } else counts.mandatory += 1;
  return {
    ...state,
    currentDifficulty: nextDifficulty,
    questionsAsked: state.questionsAsked + 1,
    consecutiveStrongAnswers: strongCount >= 2 ? 0 : strongCount,
    consecutiveWeakAnswers: weakCount >= 2 ? 0 : weakCount,
    skillsCovered,
    skillsRemaining: skillsCovered
      .filter((item) => item.coverage < 70)
      .map((item) => item.skill),
    projectsCovered: projectName
      ? Array.from(new Set([...state.projectsCovered, projectName]))
      : state.projectsCovered,
    unverifiedClaims: Array.from(
      new Set([
        ...state.unverifiedClaims,
        ...analysis.claimsRequiringVerification,
      ]),
    ),
    previousAnswerSummary: analysis.answerSummary,
    previousAnswerScore: analysis.score,
    strategyCounts: counts,
    topicFollowUps,
  };
}

export async function analyseAndGenerateNext(input: {
  context: AdaptiveContext;
  config: AdaptiveConfig;
  state: AdaptiveState;
  question: AdaptiveQuestion;
  transcript: string;
  remainingSeconds: number;
  questionsAsked: string[];
}) {
  const counts = {
    mandatory: 0,
    project: 0,
    scenario: 0,
    followUp: 0,
    ...input.state.strategyCounts,
  };
  const targetSkill =
    [...input.state.skillsCovered].sort(
      (a, b) => a.coverage - b.coverage || a.questionsAsked - b.questionsAsked,
    )[0]?.skill || input.question.skill;
  const projectAvailable =
    input.config.projectQuestionsEnabled &&
    input.context.candidateContext.projects.length > 0;
  const projectNeeded =
    projectAvailable && counts.project < input.config.minProjectQuestions;
  const scenarioNeeded =
    counts.scenario <
    Math.floor(
      (Math.max(1, input.state.questionsAsked) *
        input.config.scenarioPercentage) /
        100,
    );
  const preferredStrategy = projectNeeded
    ? "VERIFY_PROJECT_CLAIM"
    : scenarioNeeded
      ? "ASK_SCENARIO"
      : "TEST_MANDATORY_JD_SKILL";
  const prompt = `Return {"analysis":${JSON.stringify({ answerSummary: "", score: 0, technicalAccuracy: 0, practicalEvidence: 0, depth: 0, clarity: 0, answeredExpectedSignals: [], missingExpectedSignals: [], vagueClaims: [], contradictions: [], newRelevantTopics: [], claimsRequiringVerification: [], recommendedNextStrategy: preferredStrategy, recommendedDifficulty: input.state.currentDifficulty })},"nextQuestion":${JSON.stringify(input.state.fallbackQuestion)}}.\nEvaluate the answer and ask exactly one concise next question. Use only supplied evidence. Do not provide an answer or hint. Target approximately 60% mandatory skills, 25% verified resume projects, and ${input.config.scenarioPercentage}% scenarios. Preferred next strategy: ${preferredStrategy}. Preferred mandatory skill: ${targetSkill}. If a senior answer is vague, ask for concrete personal evidence before changing topic. Two strong answers should increase depth; two weak answers should reduce complexity while continuing mandatory validation. Never invent a project; if project evidence is absent ask a neutral project-overview question. Coding enabled: ${input.config.codingEnabled}. Behavioural enabled: ${input.config.behavioralEnabled}.\nContext:${JSON.stringify(input.context).slice(0, 18000)}\nState:${JSON.stringify(input.state).slice(0, 8000)}\nPrevious question:${JSON.stringify(input.question)}\nCandidate answer:${input.transcript.slice(0, 10000)}\nQuestions already asked:${JSON.stringify(input.questionsAsked).slice(0, 6000)}\nRemaining seconds:${input.remainingSeconds}`;
  try {
    const turn = await structuredRequest(
      "Conduct a structured technical interview. Ask one evidence-based question only. Do not score accent, grammar, appearance, or emotion. Never invent candidate claims.",
      prompt,
      turnSchema,
    );
    if (!questionIsRelevant(turn.nextQuestion, input.context, input.transcript))
      throw new Error(
        "Generated question was not traceable to supplied evidence",
      );
    const followUpStrategies = [
      "CLARIFY_CURRENT_ANSWER",
      "DEEPEN_TECHNICAL_TOPIC",
      "VERIFY_PROJECT_CLAIM",
    ];
    const usedTopicFollowUps =
      Number(input.state.topicFollowUps?.[input.question.skill] || 0) +
      (followUpStrategies.includes(input.question.strategy) ? 1 : 0);
    if (
      followUpStrategies.includes(turn.nextQuestion.strategy) &&
      usedTopicFollowUps >= input.config.maxFollowUpsPerTopic
    ) {
      turn.nextQuestion = {
        ...input.state.fallbackQuestion,
        strategy: "TEST_MANDATORY_JD_SKILL",
        sourceType: "JD_SKILL",
        sourceReference: targetSkill,
        skill: targetSkill,
        question: `Describe a production example where you used ${targetSkill}, including your personal implementation and how you verified the outcome.`,
        reasonForAsking:
          "Move to the next under-evaluated mandatory skill after reaching the topic follow-up limit.",
        difficulty: input.state.currentDifficulty,
      };
    }
    if (
      turn.analysis.vagueClaims.length > 0 &&
      usedTopicFollowUps < input.config.maxFollowUpsPerTopic &&
      ["ADVANCED", "ARCHITECTURE"].includes(input.state.currentDifficulty) &&
      !["CLARIFY_CURRENT_ANSWER", "VERIFY_PROJECT_CLAIM"].includes(
        turn.nextQuestion.strategy,
      )
    ) {
      turn.nextQuestion = {
        ...input.state.fallbackQuestion,
        strategy: "CLARIFY_CURRENT_ANSWER",
        sourceType: "PREVIOUS_ANSWER",
        sourceReference: turn.analysis.vagueClaims[0],
        question: `Please make your previous answer concrete: what did you personally implement for ${input.question.skill}, what decision did you make, and what measurable result did you verify?`,
        reasonForAsking:
          "Seek implementation evidence for a vague senior-level claim.",
        difficulty: input.state.currentDifficulty,
      };
    }
    return { ...turn, mode: "AI" as const };
  } catch {
    const wordsCount = input.transcript
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const score = Math.min(6, Math.round(wordsCount / 15));
    const analysis: AdaptiveAnswerAnalysis = {
      answerSummary: input.transcript.slice(0, 500),
      score,
      technicalAccuracy: score,
      practicalEvidence: score,
      depth: score,
      clarity: score,
      answeredExpectedSignals: [],
      missingExpectedSignals: input.question.expectedSignals,
      vagueClaims:
        wordsCount < 25 ? ["Answer requires more implementation detail"] : [],
      contradictions: [],
      newRelevantTopics: [],
      claimsRequiringVerification: [],
      recommendedNextStrategy: "TEST_MANDATORY_JD_SKILL",
      recommendedDifficulty: input.state.currentDifficulty,
    };
    const nextQuestion: AdaptiveQuestion = {
      ...input.state.fallbackQuestion,
      skill: targetSkill,
      sourceReference: targetSkill,
      difficulty: input.state.currentDifficulty,
      question: `Describe a practical problem you solved using ${targetSkill}, including your personal implementation, diagnosis, and verified result.`,
    };
    return { analysis, nextQuestion, mode: "RULE_BASED" as const };
  }
}
