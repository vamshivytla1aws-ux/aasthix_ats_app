import { describe, expect, it } from "vitest";
import { callStateReducer, type CallUiAction, type CallUiState } from "@/lib/chat/callStateReducer";

function run(initial: CallUiState, actions: CallUiAction[]) {
  return actions.reduce((state, action) => callStateReducer(state, action), initial);
}

describe("callStateReducer", () => {
  it("transitions through outgoing -> connecting -> connected", () => {
    const finalState = run("idle", [
      { type: "CALL_STARTED" },
      { type: "JOINED" },
      { type: "MEDIA_CONNECTED" },
    ]);
    expect(finalState).toBe("connected");
  });

  it("handles reconnect and failure path", () => {
    const finalState = run("connected", [{ type: "RECONNECTING" }, { type: "FAILURE" }]);
    expect(finalState).toBe("failed");
  });

  it("blocks illegal ended -> connected transition without reset", () => {
    const finalState = run("ended", [{ type: "MEDIA_CONNECTED" }]);
    expect(finalState).toBe("ended");
  });

  it("allows ended -> idle via reset", () => {
    const finalState = run("ended", [{ type: "RESET" }]);
    expect(finalState).toBe("idle");
  });
});

