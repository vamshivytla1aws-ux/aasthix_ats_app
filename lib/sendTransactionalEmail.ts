import { sendEmailMessage } from "@/lib/sendEmail";

export type SendEmailResult = { sent: true } | { sent: false; reason: "smtp_not_configured" | "send_failed"; detail?: string };

/** Shared SMTP transport for transactional mail (careers, screening, pipeline email). */
export async function sendTransactionalEmail(opts: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const result = await sendEmailMessage(opts);
  if (result.sent) return { sent: true };
  if (result.reason === "email_not_configured") {
    return { sent: false, reason: "smtp_not_configured", detail: result.detail };
  }
  return { sent: false, reason: "send_failed", detail: result.detail };
}
