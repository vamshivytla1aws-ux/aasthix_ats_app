import { Resend } from "resend";
import { createSmtpTransport, getSmtpConfig } from "@/lib/mailTransport";

export type SendEmailProvider = "resend" | "smtp";
export type SendEmailResult =
  | { sent: true; provider: SendEmailProvider }
  | { sent: false; reason: "email_not_configured" | "send_failed"; detail?: string };

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
  const resendFrom =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "";

  if (resendKey) {
    if (!resendFrom) {
      return { sent: false, reason: "email_not_configured", detail: "RESEND_FROM_EMAIL is required." };
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
      await resend.emails.send(payload as any);
      return { sent: true, provider: "resend" };
    } catch (e) {
      console.error("sendEmailMessage resend", e);
      const detail = e instanceof Error ? e.message : String(e);
      return { sent: false, reason: "send_failed", detail };
    }
  }

  const smtpConfig = getSmtpConfig();
  if (!smtpConfig) {
    return { sent: false, reason: "email_not_configured", detail: "Neither RESEND_API_KEY nor SMTP credentials are configured." };
  }

  const transporter = createSmtpTransport();
  if (!transporter) {
    return { sent: false, reason: "email_not_configured", detail: "SMTP transport could not be created." };
  }

  try {
    await transporter.sendMail({
      from: smtpConfig.from,
      to: recipients.join(", "),
      cc: ccRecipients.length > 0 ? ccRecipients.join(", ") : undefined,
      subject: opts.subject.slice(0, 998),
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    return { sent: true, provider: "smtp" };
  } catch (e) {
    console.error("sendEmailMessage smtp", e);
    const detail = e instanceof Error ? e.message : String(e);
    return { sent: false, reason: "send_failed", detail };
  }
}
