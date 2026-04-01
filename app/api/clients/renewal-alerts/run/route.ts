import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requirePermission("alerts.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const due = await query(
      `
      SELECT
        v.id AS client_id,
        v.name AS client_name,
        v.agreement_end_date,
        COALESCE(v.renewal_notice_days, 30) AS notice_days
      FROM vendors v
      WHERE v.created_by_user_id = $1
        AND v.agreement_end_date IS NOT NULL
        AND CURRENT_DATE >= (v.agreement_end_date - (COALESCE(v.renewal_notice_days, 30) * INTERVAL '1 day'))
      ORDER BY v.agreement_end_date ASC, v.id ASC
      `,
      [user.user_id]
    );

    let created = 0;
    for (const row of due.rows as Array<{ client_id: number; client_name: string; agreement_end_date: string; notice_days: number }>) {
      const msg = `Client agreement expiring in ${row.notice_days} days: ${row.client_name} (Expiry: ${row.agreement_end_date})`;
      const ins = await query(
        `
        INSERT INTO client_renewal_alerts (user_id, client_id, agreement_end_date, notice_days, message, status)
        VALUES ($1, $2, $3::date, $4, $5, 'unread')
        ON CONFLICT (user_id, client_id, agreement_end_date) DO NOTHING
        RETURNING id
        `,
        [user.user_id, row.client_id, row.agreement_end_date, row.notice_days, msg]
      );
      created += ins.rowCount || 0;
    }

    return NextResponse.json({ ok: true, scanned: due.rowCount || 0, created });
  } catch (error) {
    console.error("Error generating client renewal alerts", error);
    return NextResponse.json({ error: "Failed to generate renewal alerts" }, { status: 500 });
  }
}
