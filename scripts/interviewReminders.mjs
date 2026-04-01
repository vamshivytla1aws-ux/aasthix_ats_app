import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { Pool } from "pg";

// Load env
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

// ----------------------
// PostgreSQL Connection
// ----------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// ----------------------
// SMTP Setup
// ----------------------
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Verify SMTP
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP ERROR:", error);
  } else {
    console.log("✅ SMTP Ready");
  }
});

// ----------------------
// Send Email Function
// ----------------------
async function sendInterviewEmail(row) {
  const mailOptions = {
    from: SMTP_FROM || SMTP_USER,
    to: row.candidate_email,
    subject: "Interview Reminder - Aasthix Talent",
    text: `
Hi ${row.candidate_full_name},

This is a reminder that your interview is scheduled.

Role: ${row.job_title}
Date & Time: ${new Date(row.interview_datetime).toLocaleString()}

All the best!

Thanks,
Aasthix Talent
    `,
  };

  await transporter.sendMail(mailOptions);
}

// ----------------------
// Main Logic
// ----------------------
async function checkAndSendReminders() {
  try {
    console.log("⏳ Checking for upcoming interviews...");

    const result = await pool.query(`
      SELECT 
        a.id,
        a.interview_datetime,
        c.full_name AS candidate_full_name,
        c.email AS candidate_email,
        j.title AS job_title
      FROM applications a
      JOIN candidates c ON a.candidate_id = c.id
      JOIN jobs j ON a.job_id = j.id
      WHERE 
        a.interview_scheduled = true
        AND a.reminder_sent = false
        AND a.interview_datetime BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
    `);

    if (result.rows.length === 0) {
      console.log("ℹ️ No interviews in next 1 hour");
      return;
    }

    for (const row of result.rows) {
      try {
        await sendInterviewEmail(row);

        // Mark reminder sent
        await pool.query(
          `UPDATE applications SET reminder_sent = true WHERE id = $1`,
          [row.id]
        );

        console.log("📧 Email sent to:", row.candidate_email);
      } catch (err) {
        console.error("❌ Email failed:", err);
      }
    }
  } catch (err) {
    console.error("❌ Error fetching interviews:", err);
  }
}

// ----------------------
// Run Once (for testing)
// ----------------------
if (process.argv.includes("--once")) {
  checkAndSendReminders().then(() => {
    console.log("✅ Done");
    process.exit(0);
  });
}

// ----------------------
// Cron Job (every 5 min)
// ----------------------
cron.schedule("*/5 * * * *", () => {
  checkAndSendReminders();
});