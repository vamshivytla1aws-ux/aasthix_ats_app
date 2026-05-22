import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

describe("logCallEvent correlation metadata", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
  });

  it("injects correlation_id into metadata payload", async () => {
    const { logCallEvent } = await import("@/lib/chatCallGovernance");
    await logCallEvent({
      roomId: 9,
      conversationId: 10,
      userId: 1,
      eventType: "join_success",
      metadata: { reason: "state_change" },
      eventKey: "k-1",
      correlationId: "corr-xyz",
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const args = queryMock.mock.calls[0]?.[1] as unknown[];
    const metadataJson = String(args[5] || "{}");
    const metadata = JSON.parse(metadataJson);
    expect(metadata.reason).toBe("state_change");
    expect(metadata.correlation_id).toBe("corr-xyz");
  });
});
