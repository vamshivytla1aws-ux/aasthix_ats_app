import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const res = await query(
      `SELECT manual_presence FROM chat_user_preferences WHERE user_id = $1 LIMIT 1`,
      [access.user_id],
    );
    const manualPresence = String((res.rows[0] as { manual_presence?: string } | undefined)?.manual_presence || "available");
    return NextResponse.json({ manual_presence: manualPresence });
  } catch (error) {
    console.error("chat/presence GET", error);
    return NextResponse.json({ error: "Failed to load presence." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const body = await request.json().catch(() => ({}));
    const incoming = String(body?.manual_presence || "available").trim().toLowerCase();
    const manualPresence = incoming === "busy" ? "busy" : "available";

    await query(
      `INSERT INTO chat_user_preferences (user_id, manual_presence, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET manual_presence = EXCLUDED.manual_presence, updated_at = NOW()`,
      [access.user_id, manualPresence],
    );

    return NextResponse.json({
      operation_status: "success",
      user_message: "Presence updated.",
      manual_presence: manualPresence,
    });
  } catch (error) {
    console.error("chat/presence PUT", error);
    return NextResponse.json({ error: "Failed to update presence." }, { status: 500 });
  }
}

