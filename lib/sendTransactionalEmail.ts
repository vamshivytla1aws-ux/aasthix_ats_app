import { createSmtpTransport, getSmtpConfig } from "@/lib/mailTransport";

export type SendEmailResult = { sent: true } | { sent: false; reason: "smtp_not_configured" | "send_failed"; detail?: string };

/** Shared SMTP transport for transactional mail (careers, screening, pipeline email). */
export async function sendTransactionalEmail(opts: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const config = getSmtpConfig();
  if (!config) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const transporter = createSmtpTransport();
  if (!transporter) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({
      from: config.from,
      to: opts.to.join(", "),
      subject: opts.subject.slice(0, 998),
      text: opts.text,
      html: opts.html,
    });
    return { sent: true };
  } catch (e) {
    console.error("sendTransactionalEmail", e);
    const detail = e instanceof Error ? e.message : String(e);
    return { sent: false, reason: "send_failed", detail };
  }
}
