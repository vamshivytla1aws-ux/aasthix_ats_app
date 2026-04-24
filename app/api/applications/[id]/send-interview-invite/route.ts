import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { fetchApplicationCardRow } from "@/lib/applicationCard";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";
import { writeAuditLog } from "@/lib/auditLog";
import { buildCandidateEmailTemplate } from "@/lib/candidateEmailTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 100_000;
const MAX_SUBJECT = 998;
const MAX_RECIPIENTS = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(raw: unknown, label: string): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    if (label === "to") return { ok: false, error: "to is required (comma-separated email addresses)." };
    return { ok: true, emails: [] };
  }
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > MAX_RECIPIENTS) {
    return { ok: false, error: `At most ${MAX_RECIPIENTS} ${label} recipients allowed.` };
  }
  const emails: string[] = [];
  for (const part of parts) {
    if (!EMAIL_RE.test(part)) {
      return { ok: false, error: `Invalid ${label} email: ${part}` };
    }
    emails.push(part.toLowerCase());
  }
  return { ok: true, emails: [...new Set(emails)] };
}

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const applicationId = Number(context.params.id);
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      to?: unknown;
      cc?: unknown;
      subject?: unknown;
      body?: unknown;
    };

    const parsedTo = parseRecipients(body.to, "to");
    if (!parsedTo.ok) {
      return NextResponse.json({ error: parsedTo.error }, { status: 400 });
    }
    const parsedCc = parseRecipients(body.cc, "cc");
    if (!parsedCc.ok) {
      return NextResponse.json({ error: parsedCc.error }, { status: 400 });
    }

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text = typeof body.body === "string" ? body.body : "";
    if (!subject) return NextResponse.json({ error: "subject is required." }, { status: 400 });
    if (!text.trim()) return NextResponse.json({ error: "body is required." }, { status: 400 });
    if (subject.length > MAX_SUBJECT) return NextResponse.json({ error: "subject is too long." }, { status: 400 });
    if (text.length > MAX_BODY) return NextResponse.json({ error: "body is too long." }, { status: 400 });

    const row = await fetchApplicationCardRow(applicationId, user.user_id);
    if (!row) {
      return NextResponse.json({ error: "Application not found or not accessible." }, { status: 404 });
    }

    const card = row as {
      candidate_full_name?: string | null;
      job_title?: string | null;
      job_company?: string | null;
      job_location?: string | null;
    };
    const messageParagraphs = text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    const emailBody = buildCandidateEmailTemplate({
      candidateName: card.candidate_full_name,
      paragraphs: messageParagraphs.length > 0 ? messageParagraphs : [text.trim()],
      job: {
        title: card.job_title,
        company: card.job_company,
        location: card.job_location,
      },
    });

    const sendResult = await sendTransactionalEmail({
      to: parsedTo.emails,
      cc: parsedCc.emails,
      subject,
      text: emailBody.text,
      html: emailBody.html,
    });

    if (!sendResult.sent) {
      if (sendResult.reason === "smtp_not_configured") {
        return NextResponse.json(
          { error: "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL, or configure SMTP variables on the server." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: sendResult.detail || "Failed to send interview invite." }, { status: 502 });
    }

    await writeAuditLog({
      actorUserId: user.user_id,
      action: "application_interview_invite.sent",
      metadata: {
        application_id: applicationId,
        recipient_count: parsedTo.emails.length,
        cc_count: parsedCc.emails.length,
        subject_preview: subject.slice(0, 120),
      },
    });

    return NextResponse.json({ ok: true, sent: true });
  } catch (error) {
    console.error("POST /api/applications/[id]/send-interview-invite", error);
    return NextResponse.json({ error: "Failed to send interview invite." }, { status: 500 });
  }
}
