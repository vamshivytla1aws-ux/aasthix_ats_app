import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { sendEmailMessage } from "@/lib/sendEmail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const runtime = "nodejs";

function parseEmails(input: string) {
  return String(input || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function displayNameFromEmail(email: string) {
  const local = String(email || "").split("@")[0] || "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Candidate";
  return cleaned
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    const body = await request.json();
    const recipientsRaw = String(body?.emails || "");
    const recipients = parseEmails(recipientsRaw);
    if (recipients.length === 0) return NextResponse.json({ error: "At least one email is required" }, { status: 400 });
    const invalid = recipients.find((e) => !EMAIL_RE.test(e));
    if (invalid) return NextResponse.json({ error: `Invalid email: ${invalid}` }, { status: 400 });

    const jobRes = await query(
      `
      SELECT id, title, company, location, description, employment_type, open_positions
      FROM jobs
      WHERE id = $1
      LIMIT 1
      `,
      [jobId]
    );
    if (jobRes.rowCount === 0) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const job = jobRes.rows[0] as any;

    const subject = String(body?.subject || `Job Opportunity - ${job.title}`);
    const message =
      String(body?.message || "").trim() ||
      `We are hiring for ${job.title}. Please find the job details below and share interested profiles.`;

    if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
      return NextResponse.json({ error: "Email provider is not configured" }, { status: 500 });
    }

    let sent = 0;
    for (const to of recipients) {
      const candidateName = displayNameFromEmail(to);
      const safeName = escapeHtml(candidateName);
      const safeTitle = escapeHtml(String(job.title || ""));
      const safeCompany = escapeHtml(String(job.company || ""));
      const safeLocation = escapeHtml(String(job.location || ""));
      const safeEmploymentType = escapeHtml(String(job.employment_type || "Full Time"));
      const safeOpenPositions = escapeHtml(String(job.open_positions ?? 1));
      const safeDescription = escapeHtml(String(job.description || "Not provided"));
      const safeMessage = escapeHtml(message).replaceAll("\n", "<br/>");

      const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F8FAFC;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        <div style="padding:18px 22px;background:#0F172A;">
          <div style="font-family:Arial,sans-serif;color:#ffffff;font-size:18px;font-weight:700;">Aasthix Talent</div>
        </div>
        <div style="padding:20px 22px;font-family:Arial,sans-serif;color:#0F172A;">
          <p style="margin:0 0 10px;font-size:14px;">Hi ${safeName},</p>
          <p style="margin:0 0 12px;font-size:14px;">${safeMessage}</p>
          <p style="margin:0 0 12px;font-size:14px;">Please find the job description for <strong>${safeTitle}</strong>.</p>
          <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;padding:14px;">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px;">${safeTitle}</div>
            <div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Company:</strong> ${safeCompany}</div>
            <div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Location:</strong> ${safeLocation}</div>
            <div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Employment Type:</strong> ${safeEmploymentType}</div>
            <div style="font-size:13px;color:#334155;margin-bottom:10px;"><strong>Open Positions:</strong> ${safeOpenPositions}</div>
            <div style="font-size:13px;color:#0F172A;line-height:1.5;white-space:pre-wrap;">${safeDescription}</div>
          </div>
          <p style="margin:16px 0 0;font-size:14px;">Thanks,</p>
          <p style="margin:2px 0 0;font-size:14px;">Aasthix Talent.</p>
          <p style="margin:2px 0 0;font-size:14px;">www.aasthix.com</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
      const text = `Hi ${candidateName},

Please find the job description for ${job.title}.

Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Employment Type: ${job.employment_type ?? "Full Time"}
Open Positions: ${job.open_positions ?? 1}

Description:
${job.description || "Not provided"}

Thanks,
Aasthix Talent.
www.aasthix.com`;
      const result = await sendEmailMessage({
        to: [to],
        subject,
        html,
        text,
      });
      if (!result.sent) {
        return NextResponse.json(
          { error: result.detail || "Failed to send JD" },
          { status: result.reason === "email_not_configured" ? 503 : 502 }
        );
      }
      sent += 1;
    }

    return NextResponse.json({ ok: true, sent, attempted: recipients.length });
  } catch (error: any) {
    console.error("Error sending JD", error);
    return NextResponse.json({ error: error?.message || "Failed to send JD" }, { status: 500 });
  }
}

