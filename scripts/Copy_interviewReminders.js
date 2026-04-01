import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { Pool } from "pg";

// Load local envs for running from the repo
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const {
  DATABASE_URL,
  DB_SSL,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;



if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
  throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS are required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

function safeToString(v) {
  return v === null || v === undefined ? "" : String(v);
}

async function sendInterviewRemindersOnce() {
  const windowSql = `
    SELECT
      a.id,
      a.interview_datetime,
      c.email AS candidate_email,
      c.full_name AS candidate_full_name,
      j.title AS job_title
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    WHERE a.interview_scheduled = true
      AND a.reminder_sent = false
      AND a.interview_datetime IS NOT NULL
      AND a.interview_datetime >= NOW()
      AND a.interview_datetime < (NOW() + INTERVAL '1 hour')
    ORDER BY a.interview_datetime ASC, a.id ASC
  `;

  const result = await pool.query(windowSql);
  const rows = result.rows;
  if (!rows.length) return { sent: 0 };

  let sent = 0;
  for (const row of rows) {
    const to = safeToString(row.candidate_email).trim();
    if (!to) continue;

    const candidateName = safeToString(row.candidate_full_name).trim() || "there";
    const jobTitle = safeToString(row.job_title).trim() || "your interview";
    const when = row.interview_datetime ? new Date(row.interview_datetime).toLocaleString() : "";

    const subject = "Interview Reminder";
    const text =
      `Hi ${candidateName},\n\n` +
      `This is a reminder that your interview (${jobTitle}) is scheduled for:\n` +
      `${when}\n\n` +
      `Thank you.`;

    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject,
      text,
    });

    // Prevent duplicates: only mark as sent after successful email send
    await pool.query(`UPDATE applications SET reminder_sent = true WHERE id = $1`, [row.id]);
    sent += 1;
  }

  return { sent };
}

async function runLoop() {
  const args = process.argv.slice(2);
  if (args.includes("--once")) {
    const res = await sendInterviewRemindersOnce();
    console.log("Interview reminders run complete:", res);
    await pool.end();
    process.exit(0);
  }

  let running = false;
  cron.schedule("*/5 * * * *", async () => {
    if (running) return;
    running = true;
    try {
      const res = await sendInterviewRemindersOnce();
      if (res?.sent) console.log("Interview reminders sent:", res.sent);
    } catch (err) {
      console.error("Interview reminder cron error:", err);
    } finally {
      running = false;
    }
  });

  console.log("Interview reminder cron started (every 5 minutes)...");
}

runLoop().catch(async (err) => {
  console.error("Failed to start interview reminder cron:", err);
  await pool.end();
  process.exit(1);
});

