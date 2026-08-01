import { z } from "zod";
import { aiInterviewConfig } from "@/lib/aiInterviews/config";
import {
  answerEvaluationSchema,
  finalEvaluationSchema,
  generatedQuestionsSchema,
} from "@/lib/aiInterviews/schemas";
import type { GeneratedInterviewQuestion } from "@/lib/aiInterviews/types";
import { withCostControlledModel } from "@/lib/ai/modelConfig";

async function openAiJson<T>(model: string, system: string, prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(withCostControlledModel({
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }, model)),
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OpenAI returned no structured content");
    return schema.parse(JSON.parse(content));
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackQuestions(input: { title: string; skills: string[]; count: number }): GeneratedInterviewQuestion[] {
  const skills = input.skills.length ? input.skills : [input.title];
  const templates = [
    "Explain a recent project where you used {skill}. What did you personally implement?",
    "What are the most important fundamentals of {skill}, and why do they matter in production?",
    "Describe a difficult problem involving {skill}. How did you diagnose and resolve it?",
    "What trade-offs would you consider when designing a scalable solution using {skill}?",
    "How do you test, monitor, and improve a production system that uses {skill}?",
    "Describe a technical decision you owned and how you communicated it to your team.",
    "Tell us about a delivery setback, what you changed, and the measurable outcome.",
    "How would you approach your first month in the role of {title}?",
  ];
  return Array.from({ length: input.count }, (_, index) => {
    const skill = skills[index % skills.length] || input.title;
    const question = templates[index % templates.length].replaceAll("{skill}", skill).replaceAll("{title}", input.title);
    return {
      question,
      skill,
      difficulty: "INTERMEDIATE" as const,
      expectedPoints: ["Specific first-hand example", "Clear technical reasoning", "Outcome or measurable impact"],
      scoringRubric: [
        { criterion: "Technical accuracy and relevance", weight: 50 },
        { criterion: "Evidence from personal experience", weight: 30 },
        { criterion: "Clarity and completeness", weight: 20 },
      ],
      maxScore: 10,
    };
  });
}

export async function generateQuestions(input: {
  title: string; description: string; experienceRequirement?: string; skills: string[];
  resumeText?: string; difficulty: string; count: number; durationMinutes: number;
}) {
  const fallback = fallbackQuestions({ title: input.title, skills: input.skills, count: input.count });
  try {
    const generated = await openAiJson(
      aiInterviewConfig.model,
      "Generate job-related, non-discriminatory interview questions. Return only JSON. Never invent candidate experience.",
      `Return {"questions":[{"question":"...","skill":"...","difficulty":"BEGINNER|INTERMEDIATE|ADVANCED","expectedPoints":["..."],"scoringRubric":[{"criterion":"...","weight":50}],"maxScore":10}]}.
Generate exactly ${input.count} questions for ${input.title}, difficulty ${input.difficulty}, duration ${input.durationMinutes} minutes.
Skills: ${input.skills.join(", ") || "derive from JD"}
Experience: ${input.experienceRequirement || "not specified"}
JD:\n${input.description.slice(0, 18000)}
Resume evidence for relevant follow-ups only:\n${(input.resumeText || "").slice(0, 18000)}`,
      generatedQuestionsSchema
    );
    return { questions: generated?.questions.slice(0, input.count) || fallback, mode: generated ? "AI" : "RULE_BASED", model: generated ? aiInterviewConfig.model : "rule_based" };
  } catch (error) {
    console.error("[ai-interviews] question generation failed", error instanceof Error ? error.message : String(error));
    return { questions: fallback, mode: "RULE_BASED", model: "rule_based" };
  }
}

export async function evaluateAnswer(input: { question: string; expectedPoints: string[]; maxScore: number; transcript: string }) {
  try {
    const evaluated = await openAiJson(
      aiInterviewConfig.evaluationModel,
      "Evaluate only the supplied answer against the rubric. Nonsensical, empty, or unrelated answers score zero. Return only JSON.",
      `Return {"score":0,"maxScore":${input.maxScore},"strengths":[],"missingPoints":[],"technicalAccuracy":"","feedback":""}.
Question: ${input.question}\nExpected points: ${input.expectedPoints.join("; ")}\nCandidate answer: ${input.transcript.slice(0, 10000)}`,
      answerEvaluationSchema
    );
    if (evaluated) return { ...evaluated, model: aiInterviewConfig.evaluationModel, fallbackReviewUsed: false };
  } catch (error) {
    console.error("[ai-interviews] answer evaluation failed", error instanceof Error ? error.message : String(error));
  }
  const words = input.transcript.trim().split(/\s+/).filter(Boolean);
  const ratio = Math.min(1, words.length / 80);
  return {
    score: Number((input.maxScore * ratio * 0.6).toFixed(2)), maxScore: input.maxScore,
    strengths: words.length >= 20 ? ["Answer contains reviewable detail"] : [],
    missingPoints: words.length < 20 ? ["Answer is too brief for reliable evaluation"] : input.expectedPoints,
    technicalAccuracy: "AI evaluation unavailable; provisional length-based score.",
    feedback: "Recruiter review is required.", model: "rule_based", fallbackReviewUsed: false,
  };
}

export async function generateFinalEvaluation(input: { title: string; answers: Array<Record<string, unknown>> }) {
  try {
    const evaluated = await openAiJson(
      aiInterviewConfig.evaluationModel,
      "Create a fair recruiter-facing interview evaluation. Integrity events are not part of performance scoring. Return only JSON.",
      `Return {"technicalScore":0,"communicationScore":0,"experienceRelevanceScore":0,"overallScore":0,"strengths":[],"concerns":[],"summary":"","recommendation":"PROCEED|HOLD_FOR_REVIEW|HUMAN_INTERVIEW_RECOMMENDED|NOT_RECOMMENDED"}.
Role: ${input.title}\nQuestion results:\n${JSON.stringify(input.answers).slice(0, 30000)}`,
      finalEvaluationSchema
    );
    if (evaluated) return { ...evaluated, model: aiInterviewConfig.evaluationModel, fallbackReviewUsed: false };
  } catch (error) {
    console.error("[ai-interviews] final evaluation failed", error instanceof Error ? error.message : String(error));
  }
  if (aiInterviewConfig.fallbackReviewEnabled && aiInterviewConfig.fallbackReviewModel !== aiInterviewConfig.evaluationModel) {
    try {
      const reviewed = await openAiJson(
        aiInterviewConfig.fallbackReviewModel,
        "Review a failed primary interview evaluation fairly. Integrity events are excluded from performance scoring. Return only JSON.",
        `Return {"technicalScore":0,"communicationScore":0,"experienceRelevanceScore":0,"overallScore":0,"strengths":[],"concerns":[],"summary":"","recommendation":"PROCEED|HOLD_FOR_REVIEW|HUMAN_INTERVIEW_RECOMMENDED|NOT_RECOMMENDED"}.\nRole: ${input.title}\nQuestion results:\n${JSON.stringify(input.answers).slice(0, 30000)}`,
        finalEvaluationSchema
      );
      if (reviewed) return { ...reviewed, model: aiInterviewConfig.fallbackReviewModel, fallbackReviewUsed: true };
    } catch (error) {
      console.error("[ai-interviews] bounded fallback review failed", error instanceof Error ? error.message : String(error));
    }
  }
  const scores = input.answers.map((a) => Number(a.percentage || 0)).filter(Number.isFinite);
  const overall = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  return {
    technicalScore: overall, communicationScore: overall, experienceRelevanceScore: overall, overallScore: overall,
    strengths: [], concerns: ["Automated final narrative was unavailable; recruiter review required."],
    summary: "A provisional score was calculated from question-level results.",
    recommendation: overall >= 70 ? "HUMAN_INTERVIEW_RECOMMENDED" as const : "HOLD_FOR_REVIEW" as const,
    model: "rule_based", fallbackReviewUsed: false,
  };
}
