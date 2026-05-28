import { buildLiveKitIdentity } from "@/lib/livekit";

export function normalizeCallSessionId(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  return normalized || null;
}

export function normalizeCallClientKind(value: unknown, userAgent?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "desktop" || raw === "mobile" || raw === "web") return raw;
  const ua = String(userAgent || "").toLowerCase();
  if (ua.includes("electron") || ua.includes("ats-app")) return "desktop";
  if (/android|iphone|ipad|mobile/.test(ua)) return "mobile";
  return "web";
}

export function requireCallSessionId(value: unknown) {
  const sessionId = normalizeCallSessionId(value);
  if (!sessionId) {
    throw new Error("session_id is required.");
  }
  return sessionId;
}

export function buildCallLiveKitIdentity(input: {
  userId: number;
  roomId: number;
  sessionId: string;
}) {
  return buildLiveKitIdentity({
    userId: input.userId,
    roomId: input.roomId,
    sessionId: input.sessionId,
  });
}
