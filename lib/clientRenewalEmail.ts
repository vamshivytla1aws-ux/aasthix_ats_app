import { createSmtpTransport, getSmtpConfig } from "@/lib/mailTransport";

export type RenewalEmailPayload = {
  to: string;
  clientName: string;
  agreementEndDate: string;
  daysLeft: number;
  renewalNoticeDays: number;
};

export async function sendClientAgreementRenewalEmail(
  opts: RenewalEmailPayload
): Promise<{ sent: true } | { sent: false; reason: string }> {
  const config = getSmtpConfig();
  if (!config) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const transporter = createSmtpTransport();
  if (!transporter) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const subject = `Action needed: client agreement renewal - ${opts.clientName}`;
  const text = `Hello,

This is an automated reminder from your ATS.

The company/client agreement for "${opts.clientName}" is approaching its end date or is within your renewal notice window (${opts.renewalNoticeDays} day(s)).

Agreement end date: ${opts.agreementEndDate}
Approx. calendar days remaining: ${opts.daysLeft}

Please review and renew the agreement in the Clients section of the app.

- ATS renewal notices`;

  const html = `
  <p>Hello,</p>
  <p>This is an automated reminder from your ATS.</p>
  <p><strong>${escapeHtml(opts.clientName)}</strong> - company agreement is in the renewal notice period
  (<strong>${opts.renewalNoticeDays}</strong> day notice window).</p>
  <ul>
    <li><strong>Agreement end date:</strong> ${escapeHtml(opts.agreementEndDate)}</li>
    <li><strong>Days left (approx.):</strong> ${opts.daysLeft}</li>
  </ul>
  <p>Please review and renew the agreement in the <strong>Clients</strong> section.</p>
  <p style="color:#64748b;font-size:12px;">- ATS renewal notices</p>
  `;

  await transporter.sendMail({
    from: config.from,
    to: opts.to,
    subject,
    text,
    html,
  });

  return { sent: true };
}

function escapeHtml(s: string) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
