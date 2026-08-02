import { AccessToken } from "livekit-server-sdk";

export function isLiveKitConfigured() {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET,
  );
}

export function liveKitUrl() {
  return String(process.env.LIVEKIT_URL || "").trim();
}

export function buildLiveKitRoomName(conversationId: number, roomId: number) {
  return `chat-conv-${conversationId}-room-${roomId}`;
}

export function buildLiveKitIdentity(input: {
  userId: number;
  roomId: number;
  sessionId: string;
}) {
  return `u-${Math.trunc(input.userId)}-r-${Math.trunc(input.roomId)}-s-${input.sessionId}`;
}

export function parseRtcIceServers(raw: string) {
  const trimmed = String(raw || "").trim();
  type IceServer = { urls: string[]; username?: string; credential?: string };
  if (!trimmed) return { servers: null as IceServer[] | null, hasTurn: false, parseError: null as string | null };
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return { servers: null, hasTurn: false, parseError: "ice_servers_not_array" };
    }
    const servers = parsed
      .map((entry: any) => {
        const urls: unknown[] = Array.isArray(entry?.urls) ? entry.urls : [entry?.urls];
        const normalized = urls
          .map((u: unknown) => String(u || "").trim())
          .filter(Boolean);
        if (!normalized.length) return null;
        return {
          urls: normalized,
          ...(entry?.username ? { username: String(entry.username) } : {}),
          ...(entry?.credential ? { credential: String(entry.credential) } : {}),
        };
      })
      .filter(Boolean) as IceServer[];
    if (!servers.length) {
      return { servers: null, hasTurn: false, parseError: "ice_servers_empty" };
    }
    const hasTurn = servers.some((s) => s.urls.some((u) => /^turns?:/i.test(u)));
    return { servers, hasTurn, parseError: null };
  } catch {
    return { servers: null, hasTurn: false, parseError: "ice_servers_invalid_json" };
  }
}

export function redactRtcIceServers(servers: ReturnType<typeof parseRtcIceServers>["servers"]) {
  return (servers || []).map((server) => ({
    urls: server.urls,
    username_configured: Boolean(server.username),
    credential_configured: Boolean(server.credential),
  }));
}

export async function probeLiveKitEndpoint(timeoutMs = 4000) {
  const configuredUrl = liveKitUrl();
  if (!configuredUrl) return { reachable: false, tls_ready: false, error: "livekit_url_missing" };
  if (!/^wss:\/\//i.test(configuredUrl)) return { reachable: false, tls_ready: false, error: "livekit_url_must_use_wss" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(configuredUrl.replace(/^wss:/i, "https:"), { method: "HEAD", cache: "no-store", signal: controller.signal });
    return { reachable: true, tls_ready: true, http_status: response.status, error: null };
  } catch (error) {
    return { reachable: false, tls_ready: false, error: error instanceof Error && error.name === "AbortError" ? "probe_timeout" : "dns_or_tls_failure" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function createLiveKitToken(input: {
  identity: string;
  name: string;
  roomName: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
}) {
  const apiKey = String(process.env.LIVEKIT_API_KEY || "");
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || "");
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit credentials are not configured.");
  }
  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: "30m",
  });
  token.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: input.canPublish !== false,
    canSubscribe: input.canSubscribe !== false,
    canPublishData: input.canPublishData !== false,
  });
  return token.toJwt();
}
