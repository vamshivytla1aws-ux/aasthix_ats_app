import nodemailer from "nodemailer";

export type SendEmailResult = { sent: true } | { sent: false; reason: "smtp_not_configured" | "send_failed"; detail?: string };

/** Shared SMTP transport for transactional mail (careers, screening, pipeline email). */
export async function sendTransactionalEmail(opts: {
  to: string[];
  subject: string;
  text: string;
}): Promise<SendEmailResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const from = SMTP_FROM || SMTP_USER;

  try {
    await transporter.sendMail({
      from,
      to: opts.to.join(", "),
      subject: opts.subject.slice(0, 998),
      text: opts.text,
    });
    return { sent: true };
  } catch (e) {
    console.error("sendTransactionalEmail", e);
    const detail = e instanceof Error ? e.message : String(e);
    return { sent: false, reason: "send_failed", detail };
  }
}
