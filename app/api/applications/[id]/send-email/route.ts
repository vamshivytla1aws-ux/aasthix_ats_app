import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { fetchApplicationCardRow } from "@/lib/applicationCard";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";
import { checkApplicationEmailSendRateLimit } from "@/lib/applicationEmail/rateLimit";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_MAX = Number(process.env.EMAIL_SEND_RATE_MAX ?? 40) || 40;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_BODY = 100_000;
const MAX_SUBJECT = 998;
const MAX_RECIPIENTS = 15;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(raw: unknown): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "to is required (comma-separated email addresses)." };
  }
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, error: "At least one email address is required." };
  }
  if (parts.length > MAX_RECIPIENTS) {
    return { ok: false, error: `At most ${MAX_RECIPIENTS} recipients allowed.` };
  }
  const emails: string[] = [];
  for (const p of parts) {
    if (!EMAIL_RE.test(p)) {
      return { ok: false, error: `Invalid email: ${p}` };
    }
    emails.push(p.toLowerCase());
  }
  return { ok: true, emails: [...new Set(emails)] };
}

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const rl = checkApplicationEmailSendRateLimit(user.user_id, { max: RATE_MAX, windowMs: RATE_WINDOW_MS });
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many send requests. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const rawId = context.params.id;
    const applicationId = Number(rawId);
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      to?: unknown;
      subject?: unknown;
      body?: unknown;
    };

    const parsed = parseRecipients(body.to);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text = typeof body.body === "string" ? body.body : "";
    if (!subject) {
      return NextResponse.json({ error: "subject is required." }, { status: 400 });
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "body is required." }, { status: 400 });
    }
    if (subject.length > MAX_SUBJECT) {
      return NextResponse.json({ error: "subject is too long." }, { status: 400 });
    }
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: "body is too long." }, { status: 400 });
    }

    const row = await fetchApplicationCardRow(applicationId, user.user_id);
    if (!row) {
      return NextResponse.json({ error: "Application not found or not accessible." }, { status: 404 });
    }

    const sendResult = await sendTransactionalEmail({
      to: parsed.emails,
      subject,
      text,
    });

    if (!sendResult.sent) {
      if (sendResult.reason === "smtp_not_configured") {
        return NextResponse.json(
          { error: "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS on the server." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: sendResult.detail || "Failed to send email." },
        { status: 502 }
      );
    }

    await writeAuditLog({
      actorUserId: user.user_id,
      action: "application_email.sent",
      metadata: {
        application_id: applicationId,
        recipient_count: parsed.emails.length,
        subject_preview: subject.slice(0, 120),
      },
    });

    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    console.error("POST /api/applications/[id]/send-email", e);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
