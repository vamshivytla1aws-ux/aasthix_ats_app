import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — disposition reason counts (reporting / compliance dashboards).
 */
export async function GET(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const can =
      access.role === "admin" ||
      access.permissions["jobs.view"] !== false ||
      access.permissions["pipeline.view"] !== false;
    if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 90));

    const res = await query(
      `
      SELECT
        dr.id AS reason_id,
        dr.code,
        dr.label,
        dr.category,
        COUNT(*)::int AS event_count
      FROM disposition_events de
      JOIN disposition_reasons dr ON dr.id = de.disposition_reason_id
      WHERE de.created_at >= NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY dr.id, dr.code, dr.label, dr.category
      ORDER BY event_count DESC, dr.label ASC
      `,
      [days]
    );

    return NextResponse.json({ days, rows: res.rows });
  } catch (e: any) {
    if (e?.code === "42P01") return NextResponse.json({ days: 90, rows: [] });
    console.error("disposition-metrics GET", e);
    return NextResponse.json({ error: "Failed to load disposition metrics" }, { status: 500 });
  }
}
