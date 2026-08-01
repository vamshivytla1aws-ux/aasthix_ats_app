import { z } from "zod";

export const createInterviewSchema = z.object({
  job_id: z.coerce.number().int().positive(),
  candidate_id: z.coerce.number().int().positive(),
  application_id: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().trim().min(3).max(200),
  instructions: z.string().trim().max(5000).optional().default(""),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "MIXED"]).default("MIXED"),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  question_count: z.coerce.number().int().min(1).max(20).default(7),
  duration_minutes: z.coerce.number().int().min(5).max(180).default(40),
  expires_at: z.string().datetime(),
  look_away_warning_limit: z.coerce.number().int().min(1).max(50).default(5),
  tab_switch_warning_limit: z.coerce.number().int().min(1).max(50).default(3),
  face_missing_threshold_seconds: z.coerce.number().int().min(3).max(60).default(5),
  recording_enabled: z.boolean().default(true),
  screen_share_enabled: z.boolean().default(false),
  fullscreen_required: z.boolean().default(true),
  face_monitoring_enabled: z.boolean().default(true),
  gaze_monitoring_enabled: z.boolean().default(true),
  interview_mode: z.enum(["ADAPTIVE", "FIXED"]).default("ADAPTIVE"),
  project_questions_enabled: z.boolean().default(true),
  min_project_questions: z.coerce.number().int().min(0).max(10).default(2),
  max_followups_per_topic: z.coerce.number().int().min(0).max(5).default(2),
  scenario_percentage: z.coerce.number().int().min(0).max(50).default(15),
  recruiter_experience_override: z.coerce.number().min(0).max(50).nullable().optional(),
  coding_enabled: z.boolean().default(false),
  behavioral_enabled: z.boolean().default(false),
  allow_fundamentals_for_senior: z.boolean().default(false),
});

export const generatedQuestionSchema = z.object({
  question: z.string().trim().min(5).max(2000),
  skill: z.string().trim().min(1).max(150),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  expectedPoints: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  scoringRubric: z.array(z.object({ criterion: z.string().trim().min(1).max(500), weight: z.number().min(0).max(100) })).min(1).max(12),
  maxScore: z.number().positive().max(100).default(10),
});

export const generatedQuestionsSchema = z.object({ questions: z.array(generatedQuestionSchema).min(1).max(20) });

export const answerEvaluationSchema = z.object({
  score: z.number().min(0),
  maxScore: z.number().positive(),
  strengths: z.array(z.string()).default([]),
  missingPoints: z.array(z.string()).default([]),
  technicalAccuracy: z.string().default(""),
  feedback: z.string().default(""),
});

export const finalEvaluationSchema = z.object({
  technicalScore: z.number().min(0).max(100),
  communicationScore: z.number().min(0).max(100),
  experienceRelevanceScore: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  summary: z.string(),
  recommendation: z.enum(["PROCEED", "HOLD_FOR_REVIEW", "HUMAN_INTERVIEW_RECOMMENDED", "NOT_RECOMMENDED"]),
});
