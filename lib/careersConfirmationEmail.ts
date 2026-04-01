import nodemailer from "nodemailer";

export async function sendCareersApplicationConfirmation(opts: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return { sent: false as const, reason: "smtp_not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const from = SMTP_FROM || SMTP_USER;
  const subject = `Application received — ${opts.jobTitle}`;
  const text = `Hi ${opts.candidateName},

Thank you for applying for the ${opts.jobTitle} role at ${opts.companyName}.

We have received your application and our recruiting team will review it shortly.

Best regards,
${opts.companyName} Talent Team`;

  await transporter.sendMail({
    from,
    to: opts.to,
    subject,
    text,
  });

  return { sent: true as const };
}
