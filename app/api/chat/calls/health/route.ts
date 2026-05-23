import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { isLiveKitConfigured } from "@/lib/livekit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TurnEndpointInfo = {
  value: string;
  transport: "udp" | "tcp" | "tls" | "unknown";
};

function parseTurnEndpoints(raw: string): TurnEndpointInfo[] {
  const parsed: TurnEndpointInfo[] = [];
  const candidates = raw
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const value of candidates) {
    if (!/^turns?:/i.test(value)) continue;
    const lower = value.toLowerCase();
    let transport: TurnEndpointInfo["transport"] = "unknown";
    if (lower.startsWith("turns:")) {
      transport = "tls";
    } else if (lower.includes("transport=tcp")) {
      transport = "tcp";
    } else if (lower.includes("transport=udp")) {
      transport = "udp";
    }
    parsed.push({ value, transport });
  }
  return parsed;
}

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
    const turnEndpoints = parseTurnEndpoints(iceRaw);
    const hasTurn = turnEndpoints.length > 0;
    const hasUdpOrTls = turnEndpoints.some((e) => e.transport === "udp" || e.transport === "tls");
    const hasTcpOrTls = turnEndpoints.some((e) => e.transport === "tcp" || e.transport === "tls");
    const schema = await getSignalSchemaHealth().catch(() => ({
      schema_ready: false,
      missing_types: [] as string[],
      required_types: [] as string[],
    }));

    const ready = livekitConfigured && hasTurn && schema.schema_ready;
    const issues: string[] = [];
    if (!livekitConfigured) issues.push("livekit_not_configured");
    if (!hasTurn) issues.push("turn_missing");
    if (hasTurn && !hasUdpOrTls) issues.push("turn_no_udp_or_tls_candidate");
    if (hasTurn && !hasTcpOrTls) issues.push("turn_no_tcp_or_tls_candidate");
    if (!schema.schema_ready) issues.push("chat_call_signal_schema_not_ready");

    return NextResponse.json({
      operation_status: ready ? "success" : "blocked",
      ready,
      checks: {
        livekit: {
          configured: livekitConfigured,
        },
        turn: {
          configured: hasTurn,
          endpoints: turnEndpoints,
          has_udp_or_tls: hasUdpOrTls,
          has_tcp_or_tls: hasTcpOrTls,
        },
        schema,
      },
      issues,
      hint: ready
        ? "Chat call voice prerequisites are healthy."
        : "Fix LiveKit/TURN/schema issues before two-user voice smoke tests.",
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

