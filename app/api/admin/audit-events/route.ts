import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 100));

    const res = await query(
      `SELECT id, actor_user_id, action, metadata, created_at
       FROM app_audit_events
       ORDER BY id DESC
       LIMIT $1`,
      [limit]
    );
    return NextResponse.json({ events: res.rows });
  } catch (e) {
    console.error("audit-events GET", e);
    return NextResponse.json({ error: "Failed to load audit events" }, { status: 500 });
  }
}
