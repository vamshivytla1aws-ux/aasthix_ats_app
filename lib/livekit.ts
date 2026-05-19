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
    ttl: "2h",
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

