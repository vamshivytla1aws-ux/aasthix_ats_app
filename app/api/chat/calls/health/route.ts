import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createLiveKitToken, isLiveKitConfigured, liveKitUrl, parseRtcIceServers, probeLiveKitEndpoint, redactRtcIceServers } from "@/lib/livekit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSignalSchemaHealth() {
  const requiredTypes = [
    "offer",
    "answer",
    "ice",
    "leave",
    "presenting",
    "media_repair",
    "moderation_mute",
    "moderation_unmute",
    "moderation_remove",
    "moderation_end",
  ] as const;
  const res = await query(
    `
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'chat_call_signals_type_chk'
      AND conrelid = 'chat_call_signals'::regclass
    LIMIT 1
    `,
  );
  const def = String((res.rows[0] as { def?: string } | undefined)?.def || "");
  const missingTypes = requiredTypes.filter((type) => !def.includes(`'${type}'`));
  return {
    schema_ready: missingTypes.length === 0,
    missing_types: missingTypes,
    required_types: [...requiredTypes],
  };
}

export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const livekitConfigured = isLiveKitConfigured();
    const iceRaw = String(process.env.NEXT_PUBLIC_CHAT_ICE_SERVERS || "");
    const ice = parseRtcIceServers(iceRaw);
    const turnExpected = process.env.LIVEKIT_TURN_EXPECTED !== "false";
    const endpoint = livekitConfigured ? await probeLiveKitEndpoint() : { reachable: false, tls_ready: false, error: "livekit_not_configured" };
    let tokenReady = false;
    if (livekitConfigured) {
      tokenReady = await createLiveKitToken({ identity: "health-check", name: "Health check", roomName: "health-check", canPublish: false })
        .then(Boolean)
        .catch(() => false);
    }
    const schema = await getSignalSchemaHealth().catch(() => ({
      schema_ready: false,
      missing_types: [] as string[],
      required_types: [] as string[],
    }));
    const failures = await query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type IN ('join_fail','media_fail','drop'))::int AS total_failures,
         COUNT(*) FILTER (WHERE event_type = 'join_fail')::int AS connection_failures,
         COUNT(*) FILTER (WHERE event_type = 'media_fail' AND COALESCE(metadata->>'publish_state','') <> 'published')::int AS publish_failures,
         COUNT(*) FILTER (WHERE event_type = 'media_fail' AND COALESCE(metadata->>'subscribe_state','') <> 'subscribed')::int AS subscribe_failures
       FROM chat_call_events WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    ).then((result: { rows: unknown[] }) => result.rows[0] || null).catch(() => null);

    const ready = livekitConfigured && endpoint.reachable && tokenReady && schema.schema_ready;
    const issues: string[] = [];
    if (!livekitConfigured) issues.push("livekit_not_configured");
    if (livekitConfigured && !endpoint.reachable) issues.push(String(endpoint.error || "livekit_unreachable"));
    if (livekitConfigured && !tokenReady) issues.push("livekit_token_issuance_failed");
    if (ice.parseError) issues.push(ice.parseError);
    if (!schema.schema_ready) issues.push("chat_call_signal_schema_not_ready");

    return NextResponse.json({
      operation_status: ready ? "success" : "blocked",
      ready,
      checks: {
        livekit: {
          configured: livekitConfigured,
          url_scheme_valid: /^wss:\/\//i.test(liveKitUrl()),
          endpoint,
          token_issuance_ready: tokenReady,
        },
        turn: {
          expected_on_livekit_server: turnExpected,
          configuration_source: ice.servers?.length ? "external_ice_fallback" : "livekit_server",
          external_ice_configured: Boolean(ice.servers?.length),
          external_ice_servers: redactRtcIceServers(ice.servers),
          external_ice_has_turn: ice.hasTurn,
          parse_error: ice.parseError,
        },
        schema,
        recent_failures_24h: failures,
      },
      issues,
      hint: ready
        ? "Chat call voice prerequisites are healthy."
        : "Fix LiveKit endpoint, credentials, TLS, or schema issues before two-user voice smoke tests. TURN is validated on the LiveKit server, not from browser fallback ICE variables.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        error: error instanceof Error ? error.message : "Failed to evaluate chat call health.",
      },
      { status: 500 },
    );
  }
}
