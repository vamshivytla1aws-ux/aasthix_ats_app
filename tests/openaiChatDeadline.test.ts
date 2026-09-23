import { afterEach, expect, it, vi } from "vitest";
import { fetchOpenAiChatJson } from "@/lib/openaiChat";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("aborts a stalled JSON body after headers have arrived", async () => {
  vi.useFakeTimers();
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("body deadline exceeded")))),
  })));
  const assertion = expect(fetchOpenAiChatJson({ model: "test" }, 100)).rejects.toThrow("body deadline");
  await vi.advanceTimersByTimeAsync(101);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it("returns only a sanitized status for provider failures", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive provider details", { status: 401 })));
  await expect(fetchOpenAiChatJson({ model: "test" }, 1000)).rejects.toThrow("AI provider request failed (401)");
});
