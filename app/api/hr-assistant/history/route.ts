import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 40;

export async function GET() {
  try {
    const auth = await requirePermission("dashboard.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    try {
      const res = await query(
        `
        SELECT id, role, content, created_at
        FROM hr_assistant_messages
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT $2
        `,
        [auth.access.user_id, LIMIT]
      );
      const rows = res.rows as Array<{
        id: number;
        role: string;
        content: Record<string, unknown>;
        created_at: string;
      }>;
      const ordered = [...rows].reverse();
      return NextResponse.json({ messages: ordered });
    } catch {
      return NextResponse.json({ messages: [] });
    }
  } catch (e) {
    console.error("hr-assistant history", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
