import { describe, expect, it } from "vitest";
import { buildLiveKitIdentity, parseRtcIceServers } from "@/lib/livekit";

describe("livekit config helpers", () => {
  it("parses valid ICE server JSON and detects TURN", () => {
    const raw = JSON.stringify([
      {
        urls: [
          "turn:turn.aasthix.com:3478?transport=udp",
          "turns:turn.aasthix.com:443?transport=tcp",
        ],
      },
    ]);
    const parsed = parseRtcIceServers(raw);
    expect(parsed.parseError).toBeNull();
    expect(parsed.hasTurn).toBe(true);
    expect(parsed.servers?.[0]?.urls?.length).toBe(2);
  });

  it("fails safely on invalid JSON", () => {
    const parsed = parseRtcIceServers("{bad json}");
    expect(parsed.servers).toBeNull();
    expect(parsed.hasTurn).toBe(false);
    expect(parsed.parseError).toBe("ice_servers_invalid_json");
  });

  it("builds unique livekit identities per session", () => {
    const a = buildLiveKitIdentity({ userId: 1, roomId: 39, sessionId: "abc123" });
    const b = buildLiveKitIdentity({ userId: 1, roomId: 39, sessionId: "def456" });
    expect(a).not.toBe(b);
    expect(a.startsWith("u-1-r-39-s-")).toBe(true);
  });
});

