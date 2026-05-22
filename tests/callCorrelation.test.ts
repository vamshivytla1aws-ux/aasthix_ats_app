import { describe, expect, it, vi } from "vitest";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";

describe("resolveCallCorrelationId", () => {
  it("prefers explicit correlation header", () => {
    const id = resolveCallCorrelationId({
      correlationHeader: "corr-123",
      idempotencyHeader: "idem-123",
    });
    expect(id).toBe("corr-123");
  });

  it("falls back to idempotency header", () => {
    const id = resolveCallCorrelationId({
      correlationHeader: "   ",
      idempotencyHeader: "idem-456",
    });
    expect(id).toBe("idem-456");
  });

  it("generates call-prefixed fallback id", () => {
    vi.spyOn(Date, "now").mockReturnValue(123456);
    const id = resolveCallCorrelationId({});
    expect(id).toBe("call-123456");
  });

  it("trims long values to 120 chars", () => {
    const long = "x".repeat(400);
    const id = resolveCallCorrelationId({ correlationHeader: long });
    expect(id.length).toBe(120);
  });
});
