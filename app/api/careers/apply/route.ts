import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { pool, query } from "@/lib/db";
import {
  getCareersPublisherUserId,
  normalizeEmail,
  normalizePhoneDigits,
  isValidEmail,
  CAREERS_APPLICATION_SOURCE,
} from "@/lib/careersPublisher";
import { sendCareersApplicationConfirmation } from "@/lib/careersConfirmationEmail";
import { extractPlainTextFromResumeBuffer } from "@/lib/resumeParser";
import { refreshResumeEmbeddingForCandidate } from "@/lib/candidates/refreshResumeEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx"]);

function parseSalary(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(request: Request) {
  const publisherId = getCareersPublisherUserId();
  if (publisherId == null) {
    return NextResponse.json({ error: "Careers portal is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  // Honeypot — pretend success for bots
  const trap = String(form.get("company_site") || "").trim();
  if (trap.length > 0) {
    return NextResponse.json({ ok: true, received: true });
  }

  const jobId = Number(form.get("job_id"));
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  }

  const consent = String(form.get("consent") || "");
  if (consent !== "true" && consent !== "on" && consent !== "1") {
    return NextResponse.json({ error: "Please accept data processing to apply" }, { status: 400 });
  }

  const fullName = String(form.get("full_name") || "").trim();
  const email = normalizeEmail(String(form.get("email") || ""));
  const phoneRaw = String(form.get("phone") || "").trim();
  const experienceSummary = String(form.get("experience") || "").trim();
  const noticePeriod = String(form.get("notice_period") || "").trim();
  const location = String(form.get("location") || "").trim();
  const currentSalary = parseSalary(form.get("current_salary"));
  const expectedSalary = parseSalary(form.get("expected_salary"));
  const roleTitleCheck = String(form.get("role_title") || "").trim();

  if (!fullName || !email || !phoneRaw || !experienceSummary || !noticePeriod || !location) {
    return NextResponse.json({ error: "Please fill all required fields" }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const phoneDigits = normalizePhoneDigits(phoneRaw);
  if (phoneDigits.length < 8) {
    return NextResponse.json({ error: "Please enter a valid phone number" }, { status: 400 });
  }

  const resume = form.get("resume");
  if (!resume || typeof resume === "string") {
    return NextResponse.json({ error: "Resume file is required" }, { status: 400 });
  }

  const file = resume as File;
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Resume must be under 5MB" }, { status: 400 });
  }

  const origName = typeof file.name === "string" ? file.name : "resume";
  const ext = path.extname(origName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "Resume must be PDF, DOC, or DOCX" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = `${crypto.randomUUID()}${ext}`;
  const relDir = path.join("careers", String(publisherId));
  const absDir = path.join(process.cwd(), "public", "uploads", "resumes", relDir);
  await fs.mkdir(absDir, { recursive: true });
  const absPath = path.join(absDir, fileName);
  await fs.writeFile(absPath, buf);
  const resumeUrl = `/uploads/resumes/${relDir.replace(/\\/g, "/")}/${fileName}`;

  let resumeTextDb: string | null = null;
  try {
    const plain = await extractPlainTextFromResumeBuffer(fileName, buf);
    if (plain.trim().length >= 30) resumeTextDb = plain.slice(0, 500_000);
  } catch {
    resumeTextDb = null;
  }

  const client = await pool.connect();
  let applicationId: number;
  let jobTitle = "";
  let companyName = "";

  try {
    await client.query("BEGIN");

    const jobRes = await client.query(
      `
      SELECT id, title, company, status, open_positions
      FROM jobs
      WHERE id = $1 AND created_by_user_id = $2
      LIMIT 1
      `,
      [jobId, publisherId]
    );
    if (jobRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Job is no longer available" }, { status: 404 });
    }
    const job = jobRes.rows[0] as {
      title: string;
      company: string;
      status: string;
      open_positions: number;
    };
    jobTitle = String(job.title || "");
    companyName = String(job.company || "");
    const st = String(job.status || "").toLowerCase();
    if (!st.includes("open") || !job.open_positions || Number(job.open_positions) <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This job is not accepting applications" }, { status: 400 });
    }

    if (roleTitleCheck && jobTitle && roleTitleCheck !== jobTitle) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Job mismatch — refresh the page and try again" }, { status: 400 });
    }

    const byEmail = await client.query(
      `SELECT id, email, phone FROM candidates WHERE created_by_user_id = $1 AND lower(trim(email)) = $2 LIMIT 1`,
      [publisherId, email]
    );
    const byPhone = await client.query(
      `
      SELECT id, email, phone FROM candidates
      WHERE created_by_user_id = $1
        AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2
        AND length($2) >= 8
      LIMIT 1
      `,
      [publisherId, phoneDigits]
    );

    const rowE = byEmail.rows[0] as { id: number } | undefined;
    const rowP = byPhone.rows[0] as { id: number } | undefined;
    if (rowE && rowP && rowE.id !== rowP.id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error:
            "This phone number is already associated with a different profile. Use the email you applied with before, or contact recruiting.",
        },
        { status: 409 }
      );
    }

    let candidateId: number;
    if (rowE) {
      candidateId = rowE.id;
      await client.query(
        `
        UPDATE candidates SET
          full_name = $2,
          phone = $3,
          location = $4,
          resume_url = $5,
          resume_text = COALESCE($6, resume_text),
          experience_summary = $7,
          notice_period = $8,
          current_salary = COALESCE($9, current_salary),
          expected_salary = COALESCE($10, expected_salary),
          source = $11,
          updated_at = NOW()
        WHERE id = $1 AND created_by_user_id = $12
        `,
        [
          candidateId,
          fullName,
          phoneRaw,
          location,
          resumeUrl,
          resumeTextDb,
          experienceSummary,
          noticePeriod,
          currentSalary,
          expectedSalary,
          CAREERS_APPLICATION_SOURCE,
          publisherId,
        ]
      );
    } else if (rowP) {
      candidateId = rowP.id;
      await client.query(
        `
        UPDATE candidates SET
          full_name = $2,
          email = $3,
          location = $4,
          resume_url = $5,
          resume_text = COALESCE($6, resume_text),
          experience_summary = $7,
          notice_period = $8,
          current_salary = COALESCE($9, current_salary),
          expected_salary = COALESCE($10, expected_salary),
          source = $11,
          updated_at = NOW()
        WHERE id = $1 AND created_by_user_id = $12
        `,
        [
          candidateId,
          fullName,
          email,
          location,
          resumeUrl,
          resumeTextDb,
          experienceSummary,
          noticePeriod,
          currentSalary,
          expectedSalary,
          CAREERS_APPLICATION_SOURCE,
          publisherId,
        ]
      );
    } else {
      const ins = await client.query(
        `
        INSERT INTO candidates (
          full_name, email, phone, linkedin_url, website_url, location, resume_url, resume_text, skills,
          notice_period, current_salary, expected_salary, experience_summary, source, created_by_user_id
        )
        VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12)
        RETURNING id
        `,
        [
          fullName,
          email,
          phoneRaw,
          location,
          resumeUrl,
          resumeTextDb,
          noticePeriod,
          currentSalary,
          expectedSalary,
          experienceSummary,
          CAREERS_APPLICATION_SOURCE,
          publisherId,
        ]
      );
      candidateId = Number(ins.rows[0].id);
    }

    const dup = await client.query(
      `SELECT id FROM applications WHERE candidate_id = $1 AND job_id = $2 LIMIT 1`,
      [candidateId, jobId]
    );
    if (dup.rowCount && dup.rowCount > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "You have already applied for this role." },
        { status: 409 }
      );
    }

    const appIns = await client.query(
      `
      INSERT INTO applications (candidate_id, job_id, stage, status, updated_at, created_by_user_id, source)
      VALUES ($1, $2, 'Applied', 'Applied', NOW(), $3, $4)
      RETURNING id
      `,
      [candidateId, jobId, publisherId, CAREERS_APPLICATION_SOURCE]
    );
    applicationId = Number(appIns.rows[0].id);

    const alertMessage = `New candidate applied for ${jobTitle}`;
    await client.query(
      `
      INSERT INTO alerts (user_id, application_id, type, message, status, expires_at)
      VALUES ($1, $2, $3, $4, 'unread', NOW() + INTERVAL '30 days')
      ON CONFLICT (user_id, application_id, type)
      DO UPDATE SET
        message = EXCLUDED.message,
        expires_at = EXCLUDED.expires_at,
        status = 'unread'
      `,
      [publisherId, applicationId, "careers_apply", alertMessage]
    );

    await client.query("COMMIT");

    void refreshResumeEmbeddingForCandidate(candidateId, publisherId).catch(() => {});
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("careers apply", e);
    if (e?.code === "23505") {
      return NextResponse.json(
        {
          error:
            "A profile with this email or phone already exists. If you already applied, check your inbox or contact recruiting.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not submit application. Please try again later." }, { status: 500 });
  } finally {
    client.release();
  }

  const sessionId = String(form.get("session_id") || "").trim().slice(0, 128) || null;
  void query(
    `
    INSERT INTO careers_funnel_events (publisher_user_id, job_id, event_type, session_id, meta)
    VALUES ($1, $2, 'submit_success', $3, '{}'::jsonb)
    `,
    [publisherId, jobId, sessionId]
  ).catch(() => {});

  void sendCareersApplicationConfirmation({
    to: email,
    candidateName: fullName,
    jobTitle,
    companyName,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    application_id: applicationId,
    job_title: jobTitle,
  });
}
