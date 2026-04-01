import { query } from "@/lib/db";
import { sendClientAgreementRenewalEmail } from "@/lib/clientRenewalEmail";

const DEFAULT_NOTIFY = "vamshi.vaitla360@gmail.com";

function formatEndDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(t));
}

/**
 * Finds clients whose agreement is within the renewal notice window (inclusive of end date),
 * sends one email per (client, agreement_end_date) to CLIENT_RENEWAL_NOTIFY_EMAIL (default static inbox).
 */
export async function runClientRenewalEmails(): Promise<{
  due: number;
  sent: number;
  skipped?: boolean;
  reason?: string;
}> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return { due: 0, sent: 0, skipped: true, reason: "smtp_not_configured" };
  }

  const notifyTo = process.env.CLIENT_RENEWAL_NOTIFY_EMAIL || DEFAULT_NOTIFY;

  const due = await query(
    `
    SELECT
      v.id AS client_id,
      v.name AS client_name,
      v.agreement_end_date::text AS agreement_end_date,
      COALESCE(v.renewal_notice_days, 30)::int AS notice_days,
      GREATEST(0, (v.agreement_end_date::date - CURRENT_DATE))::int AS days_left
    FROM vendors v
    WHERE v.agreement_end_date IS NOT NULL
      AND COALESCE(v.agreement_enabled, v.invoice_agreement, FALSE) = TRUE
      AND CURRENT_DATE <= v.agreement_end_date::date
      AND CURRENT_DATE >= (
        v.agreement_end_date::date
        - (COALESCE(v.renewal_notice_days, 30) * INTERVAL '1 day')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM client_renewal_email_sent s
        WHERE s.client_id = v.id
          AND s.agreement_end_date = v.agreement_end_date::date
      )
    ORDER BY v.agreement_end_date ASC, v.id ASC
    `
  );

  let sent = 0;
  for (const row of due.rows as Array<{
    client_id: string | number;
    client_name: string;
    agreement_end_date: string;
    notice_days: number;
    days_left: number;
  }>) {
    const r = await sendClientAgreementRenewalEmail({
      to: notifyTo,
      clientName: row.client_name,
      agreementEndDate: formatEndDate(row.agreement_end_date),
      daysLeft: row.days_left,
      renewalNoticeDays: row.notice_days,
    });
    if (!r.sent) {
      console.warn("[client-renewal-emails] send failed:", row.client_name, r);
      continue;
    }
    await query(
      `
      INSERT INTO client_renewal_email_sent (client_id, agreement_end_date)
      VALUES ($1, $2::date)
      ON CONFLICT (client_id, agreement_end_date) DO NOTHING
      `,
      [Number(row.client_id), row.agreement_end_date]
    );
    sent += 1;
  }

  return { due: due.rowCount || 0, sent };
}
