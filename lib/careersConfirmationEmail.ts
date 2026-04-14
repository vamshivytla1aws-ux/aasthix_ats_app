import { sendEmailMessage } from "@/lib/sendEmail";
import { buildCandidateEmailTemplate } from "@/lib/candidateEmailTemplate";

export async function sendCareersApplicationConfirmation(opts: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}) {
  const subject = `Application received - ${opts.jobTitle}`;
  const emailBody = buildCandidateEmailTemplate({
    candidateName: opts.candidateName,
    paragraphs: [
      `Thank you for applying for the ${opts.jobTitle} role at ${opts.companyName}.`,
      "We have received your application and our recruiting team will review it shortly.",
    ],
    job: {
      title: opts.jobTitle,
      company: opts.companyName,
    },
  });

  const result = await sendEmailMessage({
    to: [opts.to],
    subject,
    text: emailBody.text,
    html: emailBody.html,
  });

  if (!result.sent && result.reason === "email_not_configured") {
    return { sent: false as const, reason: "smtp_not_configured" };
  }
  if (!result.sent) {
    throw new Error(result.detail || "Failed to send careers confirmation email");
  }

  return { sent: true as const };
}
