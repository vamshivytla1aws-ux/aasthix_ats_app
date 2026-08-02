import { Resend } from "resend";
import { createSmtpTransport, getSmtpConfig } from "@/lib/mailTransport";

export type SendEmailProvider = "resend" | "smtp";
export type SendEmailResult =
  | { sent: true; provider: SendEmailProvider; messageId?: string }
  | { sent: false; reason: "email_not_configured" | "send_failed"; detail?: string };

function providerOrder(): SendEmailProvider[] {
  const requested = String(process.env.EMAIL_PROVIDER_ORDER || "resend,smtp")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is SendEmailProvider => value === "resend" || value === "smtp");
  return [...new Set(requested.length ? requested : ["resend", "smtp"])] as SendEmailProvider[];
}

function senderDomain(sender: string) {
  const match = sender.match(/@([^>\s]+)>?$/);
  return match?.[1]?.toLowerCase() || null;
}

function safeFailure(provider: SendEmailProvider, detail: string) {
  const lower = detail.toLowerCase();
  if (provider === "resend" && lower.includes("domain is not verified")) {
    return "Resend rejected the sender because its domain is not verified. Verify SPF and DKIM in Resend, then retry.";
  }
  if (provider === "smtp" && (lower.includes("535") || lower.includes("invalid login") || lower.includes("badcredentials"))) {
    return "SMTP authentication failed. Use a Google Workspace App Password or disable SMTP fallback.";
  }
  return `${provider === "resend" ? "Resend" : "SMTP"} could not deliver the message.`;
}

async function recordDelivery(input: { provider: SendEmailProvider; sender: string; recipientCount: number; status: "sent" | "failed"; errorCategory?: string; errorDetail?: string; messageId?: string }) {
  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO email_delivery_events
       (provider, sender_domain, recipient_count, status, error_category, error_detail, message_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.provider, senderDomain(input.sender), input.recipientCount, input.status, input.errorCategory || null, input.errorDetail?.slice(0, 500) || null, input.messageId || null],
    );
  } catch {
    // Delivery must not fail because optional health history is unavailable during rollout.
  }
}

export async function sendEmailMessage(opts: {
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string | string[];
}): Promise<SendEmailResult> {
  const recipients = opts.to.map((x) => String(x || "").trim()).filter(Boolean);
  const ccRecipients = (opts.cc ?? []).map((x) => String(x || "").trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { sent: false, reason: "send_failed", detail: "No recipients provided." };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim() || "";
  const smtpConfig = getSmtpConfig();
  const configuredDomain = process.env.RESEND_VERIFIED_DOMAIN?.trim().toLowerCase();
  const failures: string[] = [];
  const order = providerOrder();

  for (const provider of order) {
  if (provider === "resend" && resendKey && resendFrom) {
    if (configuredDomain && senderDomain(resendFrom) !== configuredDomain) {
      const detail = `RESEND_FROM_EMAIL must use the configured verified domain ${configuredDomain}.`;
      failures.push(detail);
      await recordDelivery({ provider, sender: resendFrom, recipientCount: recipients.length + ccRecipients.length, status: "failed", errorCategory: "sender_domain_mismatch", errorDetail: detail });
      continue;
    }
    try {
      const resend = new Resend(resendKey);
      const payload: Record<string, unknown> = {
        from: resendFrom,
        to: recipients,
        subject: opts.subject.slice(0, 998),
      };
      if (ccRecipients.length > 0) payload.cc = ccRecipients;
      if (opts.text) payload.text = opts.text;
      if (opts.html) payload.html = opts.html;
      if (opts.replyTo) payload.replyTo = opts.replyTo;
      const result = await resend.emails.send(payload as any);
      if (result.error) {
        const detail = result.error.message || "Resend rejected the email request.";
        console.error("sendEmailMessage resend rejected", result.error);
        const safe = safeFailure("resend", detail);
        failures.push(safe);
        await recordDelivery({ provider, sender: resendFrom, recipientCount: recipients.length + ccRecipients.length, status: "failed", errorCategory: detail.toLowerCase().includes("domain is not verified") ? "domain_not_verified" : "provider_rejected", errorDetail: safe });
      } else {
        await recordDelivery({ provider, sender: resendFrom, recipientCount: recipients.length + ccRecipients.length, status: "sent", messageId: result.data?.id });
        return { sent: true, provider: "resend", messageId: result.data?.id };
      }
    } catch (e) {
      console.error("sendEmailMessage resend", e);
      const detail = e instanceof Error ? e.message : String(e);
      const safe = safeFailure("resend", detail);
      failures.push(safe);
      await recordDelivery({ provider, sender: resendFrom, recipientCount: recipients.length + ccRecipients.length, status: "failed", errorCategory: "provider_error", errorDetail: safe });
    }
    continue;
  }
  if (provider === "resend") {
    failures.push(resendKey ? "Resend sender address is not configured." : "Resend API key is not configured.");
    continue;
  }

  if (!smtpConfig) continue;
  const transporter = createSmtpTransport();
  if (!transporter) continue;

  try {
    const info = await transporter.sendMail({
      from: smtpConfig.from,
      to: recipients.join(", "),
      cc: ccRecipients.length > 0 ? ccRecipients.join(", ") : undefined,
      subject: opts.subject.slice(0, 998),
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    const rejected = Array.isArray(info.rejected) ? info.rejected.map(String).filter(Boolean) : [];
    const accepted = Array.isArray(info.accepted) ? info.accepted.map(String).filter(Boolean) : [];
    if (accepted.length === 0 || rejected.length > 0) {
      const detail = "SMTP server did not accept one or more recipients.";
      failures.push(detail);
      await recordDelivery({ provider: "smtp", sender: smtpConfig.from, recipientCount: recipients.length + ccRecipients.length, status: "failed", errorCategory: "recipient_rejected", errorDetail: detail });
      continue;
    }
    await recordDelivery({ provider: "smtp", sender: smtpConfig.from, recipientCount: recipients.length + ccRecipients.length, status: "sent", messageId: info.messageId });
    return { sent: true, provider: "smtp", messageId: info.messageId };
  } catch (e) {
    console.error("sendEmailMessage smtp", e);
    const raw = e instanceof Error ? e.message : String(e);
    const detail = safeFailure("smtp", raw);
    failures.push(detail);
    await recordDelivery({ provider: "smtp", sender: smtpConfig.from, recipientCount: recipients.length + ccRecipients.length, status: "failed", errorCategory: raw.includes("535") ? "authentication_failed" : "provider_error", errorDetail: detail });
  }
  }

  const configured = Boolean(
    (order.includes("resend") && resendKey && resendFrom) ||
    (order.includes("smtp") && smtpConfig),
  );
  return configured
    ? { sent: false, reason: "send_failed", detail: failures.join(" ") || "Configured email providers could not deliver the message." }
    : { sent: false, reason: "email_not_configured", detail: "No enabled email provider is fully configured." };
}
