import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { generateTrainingQuestions } from "@/lib/trainingQuestions";
import {
  getTrainingPublisherUserId,
  isValidEmail,
  normalizeEmail,
  normalizePhoneDigits,
  TRAINING_SOURCE_PUBLIC,
} from "@/lib/trainingPublisher";
import { storeTrainingResume } from "@/lib/training/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const publisherId = getTrainingPublisherUserId();
  if (publisherId == null) {
    return NextResponse.json({ error: "Training portal is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const trap = String(form.get("company_site") || "").trim();
  if (trap.length > 0) {
    return NextResponse.json({ ok: true, received: true });
  }

  const consent = String(form.get("consent") || "");
  if (consent !== "true" && consent !== "on" && consent !== "1") {
    return NextResponse.json({ error: "Please accept data processing consent" }, { status: 400 });
  }

  const fullName = String(form.get("full_name") || "").trim();
  const email = normalizeEmail(String(form.get("email") || ""));
  const phoneRaw = String(form.get("phone") || "").trim();
  const phoneDigits = normalizePhoneDigits(phoneRaw);
  const sessionId = String(form.get("session_id") || "").trim().slice(0, 128) || null;

  if (!fullName || !email || !phoneRaw) {
    return NextResponse.json({ error: "Please fill all required fields" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (phoneDigits.length < 8) {
    return NextResponse.json({ error: "Please enter a valid phone number" }, { status: 400 });
  }

  const resume = form.get("resume");
  if (!(resume instanceof File)) {
    return NextResponse.json({ error: "Resume file is required" }, { status: 400 });
  }

  try {
    const storedResume = await storeTrainingResume(publisherId, resume);
    const generated = await generateTrainingQuestions({
      fullName,
      resumeText: storedResume.resumeText,
    });

    const insertRes = await query(
      `
      INSERT INTO training_submissions (
        created_by_user_id,
        full_name,
        email,
        phone,
        source,
        consent_accepted,
        resume_url,
        resume_text,
        resume_file_name,
        resume_file_type,
        resume_file_size,
        resume_blob,
        resume_parse_status,
        resume_parse_error,
        question_generation_status,
        question_generation_error,
        generated_mode,
        generated_questions,
        review_status,
        session_id,
        submitted_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,'new',$19,NOW(),NOW(),NOW()
      )
      RETURNING id
      `,
      [
        publisherId,
        fullName,
        email,
        phoneRaw,
        TRAINING_SOURCE_PUBLIC,
        true,
        storedResume.resumeRecord.resume_url,
        storedResume.resumeRecord.resume_text ?? storedResume.resumeText,
        storedResume.resumeRecord.resume_file_name,
        storedResume.resumeRecord.resume_file_type,
        storedResume.resumeRecord.resume_file_size,
        storedResume.resumeRecord.resume_blob,
        storedResume.parseStatus,
        storedResume.parseError,
        generated.question_generation_status,
        generated.question_generation_error,
        generated.generated_mode,
        JSON.stringify(generated.questions),
        sessionId,
      ]
    );

    void query(
      `
      INSERT INTO training_funnel_events (publisher_user_id, event_type, session_id, meta)
      VALUES ($1, 'submit_success', $2, jsonb_build_object('submission_id', $3))
      `,
      [publisherId, sessionId, Number(insertRes.rows[0]?.id)]
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      submission_id: Number(insertRes.rows[0]?.id),
      generated_mode: generated.generated_mode,
      question_generation_status: generated.question_generation_status,
      question_generation_error: generated.question_generation_error,
      questions: generated.questions,
    });
  } catch (error) {
    console.error("training apply", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit training request" },
      { status: 500 }
    );
  }
}
