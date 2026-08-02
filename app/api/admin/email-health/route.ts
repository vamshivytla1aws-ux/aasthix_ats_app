import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireWorkspaceOwner } from "@/lib/rbac";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function senderDomain(value: string) {
  return value.match(/@([^>\s]+)>?$/)?.[1]?.toLowerCase() || null;
}

function configuration() {
  const sender = String(process.env.RESEND_FROM_EMAIL || "");
  const domain = senderDomain(sender);
  const verifiedDomain = process.env.RESEND_VERIFIED_DOMAIN?.trim().toLowerCase() || null;
  return {
    provider_order: String(process.env.EMAIL_PROVIDER_ORDER || "resend,smtp").split(",").map((value) => value.trim()).filter(Boolean),
    resend_configured: Boolean(process.env.RESEND_API_KEY && sender),
    smtp_configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    sender: domain ? `***@${domain}` : null,
    sender_domain: domain,
    expected_verified_domain: verifiedDomain,
    sender_domain_valid: !verifiedDomain || domain === verifiedDomain,
  };
}

export async function GET() {
  const auth = await requireWorkspaceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const events = await query(
    `SELECT provider, status, error_category, error_detail, message_id, created_at
     FROM email_delivery_events ORDER BY created_at DESC LIMIT 20`,
  ).catch(() => ({ rows: [] }));
  return NextResponse.json({ configuration: configuration(), recent_events: events.rows });
}

export async function POST() {
  const auth = await requireWorkspaceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await sendTransactionalEmail({
    to: [auth.access.email],
    subject: "AASTHIX email delivery test",
    text: "Your AASTHIX transactional email configuration is working.",
    html: "<p>Your <strong>AASTHIX</strong> transactional email configuration is working.</p>",
  });
  return NextResponse.json({ result, configuration: configuration() }, { status: result.sent ? 200 : 502 });
}
