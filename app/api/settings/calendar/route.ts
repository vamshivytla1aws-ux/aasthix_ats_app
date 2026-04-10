import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calendar integration status (Google / Microsoft). OAuth wiring is environment-specific;
 * this endpoint exposes whether a row exists and sync intent — not full sync state.
 */
export async function GET() {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let connections: { provider: string; sync_enabled: boolean; updated_at: string | null }[] = [];
    try {
      const res = await query(
        `
        SELECT provider, sync_enabled, updated_at
        FROM user_calendar_connections
        WHERE user_id = $1
        ORDER BY provider
        `,
        [access.user_id]
      );
      connections = res.rows.map((r: Record<string, unknown>) => ({
        provider: String(r.provider),
        sync_enabled: Boolean(r.sync_enabled),
        updated_at: r.updated_at ? String(r.updated_at) : null,
      }));
    } catch {
      connections = [];
    }

    return NextResponse.json({
      google_configured: connections.some((c) => c.provider === "google" && c.sync_enabled),
      microsoft_configured: connections.some((c) => c.provider === "microsoft" && c.sync_enabled),
      connections,
      message:
        connections.length === 0
          ? "No calendar accounts linked. Connect Google or Microsoft in a future release; store tokens securely server-side."
          : undefined,
    });
  } catch (e) {
    console.error("settings/calendar GET", e);
    return NextResponse.json({ error: "Failed to load calendar settings" }, { status: 500 });
  }
}
