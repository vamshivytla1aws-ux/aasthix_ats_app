/**
 * Screening maintenance: expire pending tests past deadline; send T+2h reminder emails.
 * Run via cron: npm run screening-jobs-once
 */
import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import cron from "node-cron";
import pg from "pg";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const { DATABASE_URL, DB_SSL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendReminder(row) {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn("[screening-jobs] SMTP not configured; skip reminder");
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const url = `${process.env.APP_PUBLIC_URL || "http://localhost:3000"}/test/${row.test_id}?token=${encodeURIComponent(row.access_token)}`;
  const html = `
  <p>Hi ${escapeHtml(row.candidate_name)},</p>
  <p>This is a reminder to complete your screening test for <strong>${escapeHtml(row.job_title)}</strong>.</p>
  <p>Please finish before your deadline. <a href="${escapeHtml(url)}">Continue test</a></p>
  `;
  await transporter.sendMail({
    from: `"Aasthix Talent" <${SMTP_USER}>`,
    to: row.candidate_email,
    subject: `Reminder: Screening test — ${row.job_title}`,
    html,
  });
  return true;
}

async function expirePending() {
  const res = await pool.query(
    `
    UPDATE screening_tests st
    SET status = 'expired', updated_at = NOW()
    WHERE st.status = 'pending'
      AND st.expires_at < NOW()
    RETURNING st.id, st.application_id, st.candidate_id
    `
  );
  for (const row of res.rows) {
    try {
      await pool.query(
        `
        INSERT INTO screening_audit_events (event_type, application_id, test_id, candidate_id, created_by_user_id, metadata, created_at)
        VALUES ('expired_batch', $1, $2, $3, NULL, '{}'::jsonb, NOW())
        `,
        [row.application_id, row.id, row.candidate_id]
      );
    } catch (e) {
      if (e.code !== "42P01") console.error("[screening-jobs] audit insert", e);
    }
  }
  return res.rowCount;
}

async function sendReminders() {
  const res = await pool.query(
    `
    SELECT
      st.id AS test_id,
      st.application_id,
      st.access_token,
      st.expires_at,
      c.email AS candidate_email,
      c.full_name AS candidate_name,
      j.title AS job_title
    FROM screening_tests st
    JOIN candidates c ON c.id = st.candidate_id
    JOIN jobs j ON j.id = st.job_id
    WHERE st.status = 'pending'
      AND st.expires_at > NOW()
      AND st.reminder_email_sent_at IS NULL
      AND st.created_at <= NOW() - INTERVAL '2 hours'
    `
  );
  let sent = 0;
  for (const row of res.rows) {
    if (!row.candidate_email) continue;
    try {
      await sendReminder(row);
      await pool.query(
        `UPDATE screening_tests SET reminder_email_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.test_id]
      );
      try {
        await pool.query(
          `
          INSERT INTO screening_audit_events (event_type, application_id, test_id, candidate_id, created_by_user_id, metadata, created_at)
          VALUES ('reminder_sent', $1, $2, NULL, NULL, '{}'::jsonb, NOW())
          `,
          [row.application_id, row.test_id]
        );
      } catch (e) {
        if (e.code !== "42P01") console.error(e);
      }
      sent += 1;
    } catch (e) {
      console.error("[screening-jobs] reminder failed", row.test_id, e.message);
    }
  }
  return sent;
}

async function runOnce() {
  const expired = await expirePending();
  const reminders = await sendReminders();
  console.log(`[screening-jobs] expired=${expired} reminders_sent=${reminders}`);
}

const once = process.argv.includes("--once");

if (once) {
  runOnce()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else {
  cron.schedule("*/15 * * * *", () => {
    runOnce().catch(console.error);
  });
  console.log("[screening-jobs] cron every 15m (use --once for single run)");
}
