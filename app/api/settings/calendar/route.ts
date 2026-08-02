import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";
import { getSharedGoogleCalendarStatus } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calendar integration status. Google shared-account OAuth is supported for Meet scheduling;
 * this endpoint exposes both legacy per-user rows and the shared Google connection state.
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

    const sharedGoogle = await getSharedGoogleCalendarStatus();
    const providerOrder = String(process.env.EMAIL_PROVIDER_ORDER || "resend,smtp").split(",").map((value) => value.trim()).filter(Boolean);
    const resendReady = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
    const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    const lastEmailEvent = await query(
      `SELECT provider, status, error_category, created_at FROM email_delivery_events ORDER BY created_at DESC LIMIT 1`,
    ).then((result: { rows: unknown[] }) => result.rows[0] || null).catch(() => null);

    return NextResponse.json({
      google_configured: connections.some((c) => c.provider === "google" && c.sync_enabled),
      microsoft_configured: connections.some((c) => c.provider === "microsoft" && c.sync_enabled),
      connections,
      shared_google: sharedGoogle,
      provider_env_ready: {
        google: sharedGoogle.configured,
      },
      transactional_email: {
        configured: (providerOrder.includes("resend") && resendReady) || (providerOrder.includes("smtp") && smtpReady),
        provider_order: providerOrder,
        last_delivery: lastEmailEvent,
      },
      message:
        connections.length === 0
          ? "No calendar accounts linked. Connect the shared Google account in Settings to create Google Meet invites from interview scheduling."
          : undefined,
    });
  } catch (e) {
    console.error("settings/calendar GET", e);
    return NextResponse.json({ error: "Failed to load calendar settings" }, { status: 500 });
  }
}
