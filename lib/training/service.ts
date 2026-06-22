import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";
import { query } from "@/lib/db";
import { buildResumeBlobRecord, contentTypeFromStoredResume, localResumePathFromUrl } from "@/lib/resumeStorage";
import { extractPlainTextFromResumeBuffer } from "@/lib/resumeParser";
import {
  analyzeTrainingAnswers,
  generateTrainingQuestions,
  normalizeTrainingAnswerAnalyses,
  normalizeTrainingAnswers,
  type TrainingAnswer,
  type TrainingAnswerAnalysis,
  type TrainingQuestion,
} from "@/lib/trainingQuestions";

export type TrainingSubmissionReviewStatus = "new" | "in_review" | "reviewed" | "contacted" | "archived";

export type TrainingSubmissionListRow = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  source: string;
  review_status: TrainingSubmissionReviewStatus;
  resume_parse_status: string;
  question_generation_status: string;
  answer_analysis_status: string;
  generated_mode: string;
  answer_analysis_mode: string | null;
  resume_url: string | null;
  resume_file_name: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  answers_submitted_at: string | null;
  question_count: number;
  answer_count: number;
};

export type TrainingSubmissionDetail = TrainingSubmissionListRow & {
  created_by_user_id: number | null;
  consent_accepted: boolean;
  resume_text: string | null;
  resume_parse_error: string | null;
  question_generation_error: string | null;
  answer_analysis_error: string | null;
  overall_answer_score: number | null;
  answer_summary: string | null;
  reviewer_notes: string | null;
  generated_questions: TrainingQuestion[];
  trainee_answers: TrainingAnswer[];
  answer_analyses: TrainingAnswerAnalysis[];
  session_id: string | null;
};

type TrainingSubmissionDbRow = Omit<
  TrainingSubmissionDetail,
  "generated_questions" | "trainee_answers" | "answer_analyses" | "question_count" | "answer_count"
> & {
  generated_questions: unknown;
  trainee_answers: unknown;
  answer_analyses: unknown;
  question_count?: number;
  answer_count?: number;
};

const TRAINING_ALLOWED_EXT = new Set([".pdf", ".doc", ".docx"]);
const TRAINING_MAX_BYTES = 5 * 1024 * 1024;

export function validateTrainingResumeFile(file: File) {
  if (file.size <= 0 || file.size > TRAINING_MAX_BYTES) {
    throw new Error("Resume must be under 5MB");
  }
  const ext = path.extname(file.name || "").toLowerCase();
  if (!TRAINING_ALLOWED_EXT.has(ext)) {
    throw new Error("Resume must be PDF, DOC, or DOCX");
  }
}

export async function storeTrainingResume(ownerUserId: number | null, file: File) {
  validateTrainingResumeFile(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  const originalName = file.name || "resume";
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const fileName = `${crypto.randomUUID()}${ext}`;
  const relDir = path.join("training", String(ownerUserId ?? "public"));
  const absDir = path.join(process.cwd(), "public", "uploads", "resumes", relDir);
  await fs.mkdir(absDir, { recursive: true });
  const absPath = path.join(absDir, fileName);
  await fs.writeFile(absPath, bytes);
  const resumeUrl = `/uploads/resumes/${relDir.replace(/\\/g, "/")}/${fileName}`;

  let resumeText: string | null = null;
  let parseStatus = "parsed";
  let parseError: string | null = null;
  try {
    const plain = await extractPlainTextFromResumeBuffer(originalName, bytes);
    if (plain.trim().length >= 30) {
      resumeText = plain.slice(0, 500_000);
    } else {
      parseStatus = "weak_text";
      parseError = "Could not extract enough readable text from the uploaded resume.";
    }
  } catch (error) {
    parseStatus = "parse_failed";
    parseError = error instanceof Error ? error.message : "Could not parse resume text";
  }

  const resumeRecord = await buildResumeBlobRecord({
    resumeUrl,
    resumeText,
    fileName: originalName,
    fileType: file.type || null,
    fileBytes: bytes,
  });

  return {
    resumeRecord,
    resumeText,
    parseStatus,
    parseError,
  };
}

function normalizeQuestions(raw: unknown): TrainingQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const question = String(row?.question || "").trim();
      if (!question) return null;
      return {
        category: String(row?.category || "technical") as TrainingQuestion["category"],
        question,
        reference_answer: String(row?.reference_answer || "").trim(),
        sort_order: Number(row?.sort_order) || index + 1,
      } satisfies TrainingQuestion;
    })
    .filter((item): item is TrainingQuestion => Boolean(item));
}

function mapTrainingSubmission(row: TrainingSubmissionDbRow): TrainingSubmissionDetail {
  const generatedQuestions = normalizeQuestions(row.generated_questions);
  const traineeAnswers = normalizeTrainingAnswers(row.trainee_answers);
  const answerAnalyses = normalizeTrainingAnswerAnalyses(row.answer_analyses);
  return {
    id: Number(row.id),
    created_by_user_id: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    full_name: String(row.full_name || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    source: String(row.source || ""),
    consent_accepted: Boolean(row.consent_accepted),
    resume_url: row.resume_url ? String(row.resume_url) : null,
    resume_text: row.resume_text ? String(row.resume_text) : null,
    resume_file_name: row.resume_file_name ? String(row.resume_file_name) : null,
    review_status: String(row.review_status || "new") as TrainingSubmissionReviewStatus,
    resume_parse_status: String(row.resume_parse_status || "pending"),
    resume_parse_error: row.resume_parse_error ? String(row.resume_parse_error) : null,
    question_generation_status: String(row.question_generation_status || "pending"),
    question_generation_error: row.question_generation_error ? String(row.question_generation_error) : null,
    answer_analysis_status: String(row.answer_analysis_status || "pending"),
    answer_analysis_error: row.answer_analysis_error ? String(row.answer_analysis_error) : null,
    generated_mode: String(row.generated_mode || "RULE_BASED"),
    answer_analysis_mode: row.answer_analysis_mode ? String(row.answer_analysis_mode) : null,
    generated_questions: generatedQuestions,
    trainee_answers: traineeAnswers,
    answer_analyses: answerAnalyses,
    overall_answer_score: row.overall_answer_score == null ? null : Number(row.overall_answer_score),
    answer_summary: row.answer_summary ? String(row.answer_summary) : null,
    reviewer_notes: row.reviewer_notes ? String(row.reviewer_notes) : null,
    session_id: row.session_id ? String(row.session_id) : null,
    submitted_at: new Date(row.submitted_at).toISOString(),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    answers_submitted_at: row.answers_submitted_at ? new Date(row.answers_submitted_at).toISOString() : null,
    question_count: generatedQuestions.length,
    answer_count: traineeAnswers.filter((answer) => answer.answer.trim()).length,
  };
}

export function summarizeTrainingSubmission(row: TrainingSubmissionDbRow): TrainingSubmissionListRow {
  const detail = mapTrainingSubmission(row);
  return {
    id: detail.id,
    full_name: detail.full_name,
    email: detail.email,
    phone: detail.phone,
    source: detail.source,
    review_status: detail.review_status,
    resume_parse_status: detail.resume_parse_status,
    question_generation_status: detail.question_generation_status,
    answer_analysis_status: detail.answer_analysis_status,
    generated_mode: detail.generated_mode,
    answer_analysis_mode: detail.answer_analysis_mode,
    resume_url: detail.resume_url,
    resume_file_name: detail.resume_file_name,
    submitted_at: detail.submitted_at,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    answers_submitted_at: detail.answers_submitted_at,
    question_count: detail.question_count,
    answer_count: detail.answer_count,
  };
}

const TRAINING_SUBMISSION_SELECT = `
  id,
  created_by_user_id,
  full_name,
  email,
  phone,
  source,
  consent_accepted,
  resume_url,
  resume_text,
  resume_file_name,
  review_status,
  resume_parse_status,
  resume_parse_error,
  question_generation_status,
  question_generation_error,
  answer_analysis_status,
  answer_analysis_error,
  generated_mode,
  answer_analysis_mode,
  generated_questions,
  trainee_answers,
  answer_analyses,
  overall_answer_score,
  answer_summary,
  reviewer_notes,
  session_id,
  submitted_at,
  created_at,
  updated_at,
  answers_submitted_at
`;

export async function getTrainingSubmissionDetail(id: number): Promise<TrainingSubmissionDetail | null> {
  const result = await query(
    `
    SELECT
      ${TRAINING_SUBMISSION_SELECT}
    FROM training_submissions
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  const row = result.rows[0] as TrainingSubmissionDbRow | undefined;
  return row ? mapTrainingSubmission(row) : null;
}

export async function regenerateTrainingSubmissionQuestions(id: number) {
  const detail = await getTrainingSubmissionDetail(id);
  if (!detail) return null;
  const generated = await generateTrainingQuestions({
    fullName: detail.full_name,
    resumeText: detail.resume_text,
  });
  const updateRes = await query(
    `
    UPDATE training_submissions
    SET
      generated_questions = $2::jsonb,
      generated_mode = $3,
      question_generation_status = $4,
      question_generation_error = $5,
      updated_at = NOW()
    WHERE id = $1
    RETURNING ${TRAINING_SUBMISSION_SELECT}
    `,
    [
      id,
      JSON.stringify(generated.questions),
      generated.generated_mode,
      generated.question_generation_status,
      generated.question_generation_error,
    ]
  );
  const row = updateRes.rows[0] as TrainingSubmissionDbRow | undefined;
  return row ? mapTrainingSubmission(row) : null;
}

export async function saveTrainingSubmissionAnswers(input: {
  id: number;
  sessionId: string;
  answers: TrainingAnswer[];
}) {
  const lookup = await query(
    `
    SELECT
      ${TRAINING_SUBMISSION_SELECT}
    FROM training_submissions
    WHERE id = $1
    LIMIT 1
    `,
    [input.id]
  );
  const row = lookup.rows[0] as TrainingSubmissionDbRow | undefined;
  if (!row) {
    throw new Error("Training submission not found");
  }

  const submission = mapTrainingSubmission(row);
  if (!submission.session_id || submission.session_id !== input.sessionId) {
    throw new Error("This training submission session is no longer valid. Please resubmit the profile.");
  }

  const answers = normalizeTrainingAnswers(input.answers).map((answer, index) => {
    const fallbackQuestion = submission.generated_questions[index];
    return {
      category: answer.category || fallbackQuestion?.category || "technical",
      question: answer.question || fallbackQuestion?.question || `Question ${index + 1}`,
      answer: answer.answer,
      sort_order: answer.sort_order || fallbackQuestion?.sort_order || index + 1,
    } satisfies TrainingAnswer;
  });

  if (!answers.length) {
    throw new Error("At least one answer is required");
  }

  const answeredCount = answers.filter((answer) => answer.answer.trim()).length;
  if (answeredCount === 0) {
    throw new Error("Please answer at least one question before submitting");
  }

  const updateRes = await query(
    `
    UPDATE training_submissions
    SET
      trainee_answers = $2::jsonb,
      answer_analyses = '[]'::jsonb,
      answer_analysis_mode = NULL,
      answer_analysis_status = 'queued',
      answer_analysis_error = NULL,
      overall_answer_score = NULL,
      answer_summary = NULL,
      answers_submitted_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING ${TRAINING_SUBMISSION_SELECT}
    `,
    [
      input.id,
      JSON.stringify(answers),
    ]
  );

  const updated = updateRes.rows[0] as TrainingSubmissionDbRow | undefined;
  return updated ? mapTrainingSubmission(updated) : null;
}

export async function analyzeStoredTrainingSubmissionAnswers(id: number) {
  try {
    const submission = await getTrainingSubmissionDetail(id);
    if (!submission || !submission.trainee_answers.length) return null;

    const analysis = await analyzeTrainingAnswers({
      fullName: submission.full_name,
      resumeText: submission.resume_text,
      questions: submission.generated_questions,
      answers: submission.trainee_answers,
    });

    const updateRes = await query(
      `
      UPDATE training_submissions
      SET
        answer_analyses = $2::jsonb,
        answer_analysis_mode = $3,
        answer_analysis_status = $4,
        answer_analysis_error = $5,
        overall_answer_score = $6,
        answer_summary = $7,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${TRAINING_SUBMISSION_SELECT}
      `,
      [
        id,
        JSON.stringify(analysis.answer_analyses),
        analysis.analysis_mode,
        analysis.answer_analysis_status,
        analysis.answer_analysis_error,
        analysis.overall_answer_score,
        analysis.answer_summary,
      ]
    );

    const updated = updateRes.rows[0] as TrainingSubmissionDbRow | undefined;
    return updated ? mapTrainingSubmission(updated) : null;
  } catch (error) {
    await query(
      `
      UPDATE training_submissions
      SET
        answer_analysis_status = 'failed',
        answer_analysis_error = $2,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, error instanceof Error ? error.message : "Background answer analysis failed"]
    ).catch(() => {});
    throw error;
  }
}

export async function deleteTrainingSubmission(id: number) {
  const result = await query(
    `
    DELETE FROM training_submissions
    WHERE id = $1
    RETURNING resume_url
    `,
    [id]
  );
  const row = result.rows[0] as { resume_url?: string | null } | undefined;
  if (!row) return false;

  const absolutePath = localResumePathFromUrl(row.resume_url ?? null);
  if (absolutePath) {
    await fs.unlink(absolutePath).catch(() => {});
  }
  return true;
}

export async function readTrainingResumeForResponse(id: number) {
  const result = await query(
    `
    SELECT resume_url, resume_file_name, resume_file_type, resume_blob
    FROM training_submissions
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  const row = result.rows[0] as
    | {
        resume_url: string | null;
        resume_file_name: string | null;
        resume_file_type: string | null;
        resume_blob: Buffer | null;
      }
    | undefined;
  if (!row) return null;

  const absolutePath = localResumePathFromUrl(row.resume_url);
  if (absolutePath) {
    try {
      const fileBuffer = await fs.readFile(absolutePath);
      return {
        body: new Uint8Array(fileBuffer),
        fileName: row.resume_file_name?.trim() || path.basename(absolutePath),
        contentType: contentTypeFromStoredResume(row.resume_file_name, row.resume_file_type, absolutePath),
      };
    } catch {
      // fall through to blob
    }
  }

  if (!row.resume_blob || !Buffer.isBuffer(row.resume_blob)) return null;
  return {
    body: new Uint8Array(row.resume_blob),
    fileName: row.resume_file_name?.trim() || "resume",
    contentType: contentTypeFromStoredResume(row.resume_file_name, row.resume_file_type, row.resume_url),
  };
}
