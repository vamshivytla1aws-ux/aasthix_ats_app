import { describe, expect, it } from "vitest";
import {
  buildCallLiveKitIdentity,
  normalizeCallClientKind,
  normalizeCallSessionId,
  requireCallSessionId,
} from "@/lib/chat/callSessions";

describe("call session helpers", () => {
  it("normalizes session ids to a safe stable token", () => {
    expect(normalizeCallSessionId(" s-abc_123!! ")).toBe("s-abc_123");
  });

  it("rejects empty session ids when required", () => {
    expect(() => requireCallSessionId("")).toThrow("session_id is required.");
  });

  it("detects desktop and mobile client kind from user agent", () => {
    expect(normalizeCallClientKind("", "ats-app/0.1 Electron/31")).toBe("desktop");
    expect(normalizeCallClientKind("", "Mozilla/5.0 Android Mobile")).toBe("mobile");
    expect(normalizeCallClientKind("", "Mozilla/5.0 Windows")).toBe("web");
  });

  it("builds stable LiveKit identity for the same room session", () => {
    const a = buildCallLiveKitIdentity({ userId: 1, roomId: 42, sessionId: "s-1" });
    const b = buildCallLiveKitIdentity({ userId: 1, roomId: 42, sessionId: "s-1" });
    const c = buildCallLiveKitIdentity({ userId: 1, roomId: 42, sessionId: "s-2" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe("u-1-r-42-s-s-1");
  });
});
