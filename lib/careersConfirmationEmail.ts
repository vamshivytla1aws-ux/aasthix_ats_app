import { sendEmailMessage } from "@/lib/sendEmail";

export async function sendCareersApplicationConfirmation(opts: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}) {
  const subject = `Application received - ${opts.jobTitle}`;
  const text = `Hi ${opts.candidateName},

Thank you for applying for the ${opts.jobTitle} role at ${opts.companyName}.

We have received your application and our recruiting team will review it shortly.

Best regards,
${opts.companyName} Talent Team`;

  const result = await sendEmailMessage({
    to: [opts.to],
    subject,
    text,
  });

  if (!result.sent && result.reason === "email_not_configured") {
    return { sent: false as const, reason: "smtp_not_configured" };
  }
  if (!result.sent) {
    throw new Error(result.detail || "Failed to send careers confirmation email");
  }

  return { sent: true as const };
}
