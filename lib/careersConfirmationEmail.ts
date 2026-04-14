import { createSmtpTransport, getSmtpConfig } from "@/lib/mailTransport";

export async function sendCareersApplicationConfirmation(opts: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}) {
  const config = getSmtpConfig();
  if (!config) {
    return { sent: false as const, reason: "smtp_not_configured" };
  }

  const transporter = createSmtpTransport();
  if (!transporter) {
    return { sent: false as const, reason: "smtp_not_configured" };
  }

  const subject = `Application received - ${opts.jobTitle}`;
  const text = `Hi ${opts.candidateName},

Thank you for applying for the ${opts.jobTitle} role at ${opts.companyName}.

We have received your application and our recruiting team will review it shortly.

Best regards,
${opts.companyName} Talent Team`;

  await transporter.sendMail({
    from: config.from,
    to: opts.to,
    subject,
    text,
  });

  return { sent: true as const };
}
