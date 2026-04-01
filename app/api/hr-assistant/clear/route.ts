import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requirePermission("dashboard.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    try {
      await query(`DELETE FROM hr_assistant_messages WHERE user_id = $1`, [auth.access.user_id]);
    } catch {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("hr-assistant clear", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
