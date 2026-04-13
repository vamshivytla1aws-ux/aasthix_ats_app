import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { generateScreeningQuestions, SCREENING_GEN_MODEL } from "@/lib/screeningAi";
import { logScreeningAudit } from "@/lib/screeningAudit";

function escapeHtml(unsafe: string) {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDeadline(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

async function sendScreeningEmail(input: {
  to: string;
  candidateName: string;
  jobTitle: string;
  testUrl: string;
  deadlineIso: string;
}) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return false;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const deadlineLabel = formatDeadline(input.deadlineIso);
  const subject = `Screening Test: ${input.jobTitle || "Job Role"}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F8FAFC;">
    <div style="max-width:620px;margin:0 auto;padding:24px;">
      <div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;background:#0F172A;">
          <div style="font-family:Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:700;">Aasthix Talent</div>
        </div>
        <div style="padding:20px 24px;font-family:Arial,sans-serif;color:#0F172A;">
          <p style="margin:0 0 12px;">Hi ${escapeHtml(input.candidateName || "there")},</p>
          <p style="margin:0 0 12px;">
            Please complete the screening test for the role <strong>${escapeHtml(input.jobTitle || "N/A")}</strong>.
          </p>
          <p style="margin:0 0 14px;">
            Deadline: <strong>${escapeHtml(deadlineLabel)}</strong> (valid for 4 hours, one-time submission).
          </p>
          <p style="margin:0 0 18px;">
            <a href="${escapeHtml(input.testUrl)}" style="display:inline-block;background:#2563EB;color:#FFFFFF;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">
              Start Screening Test
            </a>
          </p>
          <p style="margin:0;color:#475569;font-size:13px;">
            If the link does not open, copy this URL in your browser:<br/>
            <span style="word-break:break-all;">${escapeHtml(input.testUrl)}</span>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
  await transporter.sendMail({
    from: `"Aasthix Talent" <${SMTP_USER}>`,
    to: input.to,
    subject,
    html,
  });
  return true;
}

export async function createAndSendScreeningTest(input: {
  applicationId: number;
  userId: number;
  origin: string;
  reason: "auto" | "manual_resend";
}) {
  const client = await pool.connect();
  let testId = 0;
  let expiresAt = "";
  let token = "";
  let candidateEmail: string | null = null;
  let candidateName = "Candidate";
  let jobTitle = "Job Role";
  let candidateId = 0;
  let committed = false;
  let appRow: {
    application_id: number;
    candidate_id: number;
  } | null = null;

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [BigInt(input.applicationId)]);

    const appInfoRes = await client.query(
      `
      SELECT
        a.id AS application_id,
        a.stage,
        a.candidate_id,
        a.job_id,
        c.full_name AS candidate_name,
        c.email AS candidate_email,
        j.title AS job_title,
        j.description AS job_description
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [input.applicationId]
    );

    if (appInfoRes.rowCount === 0) {
      throw new Error("Application not found");
    }

    const app = appInfoRes.rows[0] as {
      application_id: number;
      stage: string;
      candidate_id: number;
      job_id: number;
      candidate_name: string | null;
      candidate_email: string | null;
      job_title: string | null;
      job_description: string | null;
    };

    if (input.reason === "auto" && app.stage !== "Screening") {
      throw new Error("Application is not in Screening stage");
    }

    candidateEmail = app.candidate_email;
    candidateName = app.candidate_name || "Candidate";
    jobTitle = app.job_title || "Job Role";
    candidateId = app.candidate_id;
    appRow = { application_id: app.application_id, candidate_id: app.candidate_id };

    await client.query(
      `
      UPDATE screening_tests
      SET status = 'expired',
          updated_at = NOW()
      WHERE application_id = $1
        AND status = 'pending'
      `,
      [app.application_id]
    );

    const questions = await generateScreeningQuestions({
      jobTitle: app.job_title || "",
      jobDescription: app.job_description || "",
      skillsCsv: "",
      minCount: 5,
      maxCount: 8,
    });

    token = randomUUID().replaceAll("-", "");
    const genModel = process.env.OPENAI_API_KEY ? SCREENING_GEN_MODEL : "rule_based";

    const testRes = await client.query(
      `
      INSERT INTO screening_tests (
        application_id, candidate_id, job_id, created_by_user_id, access_token, status, expires_at,
        created_at, updated_at, generation_model
      )
      VALUES (
        $1, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '4 hours', NOW(), NOW(), $6
      )
      RETURNING id, expires_at
      `,
      [app.application_id, app.candidate_id, app.job_id, input.userId, token, genModel]
    );

    testId = Number(testRes.rows[0].id);
    expiresAt = String(testRes.rows[0].expires_at);

    for (const q of questions) {
      await client.query(
        `
        INSERT INTO screening_test_questions (test_id, question_type, question_text, sort_order, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [testId, q.question_type, q.question_text, q.sort_order]
      );
    }

    await client.query("COMMIT");
    committed = true;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw e;
  } finally {
    client.release();
  }

  if (committed && appRow) {
    await logScreeningAudit({
      event_type: input.reason === "manual_resend" ? "test_resent" : "test_created",
      application_id: appRow.application_id,
      test_id: testId,
      candidate_id: appRow.candidate_id,
      created_by_user_id: input.userId,
      metadata: { reason: input.reason },
    });
  }

  const testUrl = `${input.origin}/test/${testId}?token=${encodeURIComponent(token)}`;
  if (candidateEmail) {
    try {
      await sendScreeningEmail({
        to: candidateEmail,
        candidateName,
        jobTitle,
        testUrl,
        deadlineIso: expiresAt,
      });
    } catch (e) {
      console.error("Failed to send screening email", e);
    }
  }

  try {
    const message =
      input.reason === "manual_resend"
        ? "Screening test link resent by recruiter"
        : "Screening test generated and sent";
    await pool.query(
      `
      INSERT INTO candidate_activity (candidate_id, type, description, created_at)
      VALUES ($1, 'Screening', $2, NOW())
      `,
      [candidateId, message]
    );
  } catch {
    // optional table guard
  }

  return { testId, testUrl, expiresAt };
}
