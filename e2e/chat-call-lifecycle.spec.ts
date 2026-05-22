import { expect, test, type Page } from "@playwright/test";

const USER_A_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "";
const USER_A_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || "";
const USER_B_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL_2 || "";
const USER_B_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD_2 || "";

async function installMediaMocks(page: Page) {
  await page.addInitScript(() => {
    const fakeTrack = () => ({
      kind: "audio",
      enabled: true,
      muted: false,
      readyState: "live",
      stop() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
      getSettings() {
        return {};
      },
      getConstraints() {
        return {};
      },
      getCapabilities() {
        return {};
      },
      applyConstraints: async () => {},
      clone() {
        return fakeTrack() as MediaStreamTrack;
      },
    });
    const fakeStream = () =>
      ({
        getTracks: () => [fakeTrack() as MediaStreamTrack],
        getAudioTracks: () => [fakeTrack() as MediaStreamTrack],
        getVideoTracks: () => [],
      }) as unknown as MediaStream;

    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => fakeStream();
      navigator.mediaDevices.enumerateDevices = async () => [
        { deviceId: "mic-1", kind: "audioinput", label: "Mock Mic", groupId: "g1", toJSON: () => ({}) },
        { deviceId: "spk-1", kind: "audiooutput", label: "Mock Speaker", groupId: "g1", toJSON: () => ({}) },
      ] as MediaDeviceInfo[];
    }
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function playPatched() {
      return Promise.resolve().then(() => originalPlay.call(this)).catch(() => Promise.resolve());
    };
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|pipeline|candidates|jobs|chat)/, { timeout: 30000 });
}

async function openChatConversation(page: Page) {
  const convRes = await page.request.get("/api/chat/conversations");
  expect(convRes.ok()).toBeTruthy();
  const payload = (await convRes.json()) as { conversations?: Array<{ id: number }> };
  const conversationId = Number(payload.conversations?.[0]?.id || 0);
  expect(conversationId).toBeGreaterThan(0);
  await page.goto(`/chat?conversation=${conversationId}`);
  await expect(page.getByRole("button", { name: /^call$/i })).toBeVisible({ timeout: 20000 });
  return conversationId;
}

test.describe("chat call lifecycle smoke", () => {
  test("web to mobile viewport lifecycle", async ({ browser }) => {
    test.skip(
      !USER_A_EMAIL || !USER_A_PASSWORD || !USER_B_EMAIL || !USER_B_PASSWORD,
      "PLAYWRIGHT_TEST_EMAIL/PASSWORD and PLAYWRIGHT_TEST_EMAIL_2/PASSWORD_2 are required",
    );
    const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 393, height: 851 } });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await installMediaMocks(pageA);
    await installMediaMocks(pageB);
    await login(pageA, USER_A_EMAIL, USER_A_PASSWORD);
    await login(pageB, USER_B_EMAIL, USER_B_PASSWORD);
    const conversationId = await openChatConversation(pageA);
    await pageB.goto(`/chat?conversation=${conversationId}`);
    await expect(pageB.getByRole("button", { name: /^call$/i })).toBeVisible({ timeout: 20000 });

    await pageA.getByRole("button", { name: /^call$/i }).click();
    const joinNowA = pageA.getByRole("button", { name: /join now/i });
    if (await joinNowA.isVisible().catch(() => false)) {
      await joinNowA.click();
    }
    await expect(pageA.getByRole("button", { name: /end call/i })).toBeVisible({ timeout: 30000 });

    const acceptB = pageB.getByRole("button", { name: /accept|join now/i }).first();
    await expect(acceptB).toBeVisible({ timeout: 30000 });
    await acceptB.click();
    await expect(pageB.getByRole("button", { name: /end call/i })).toBeVisible({ timeout: 30000 });

    const stateRes = await pageA.request.get(`/api/chat/conversations/${conversationId}/calls/state`);
    expect(stateRes.ok()).toBeTruthy();
    const statePayload = (await stateRes.json()) as { call?: { status?: string } | null };
    expect(statePayload.call?.status === "active" || statePayload.call?.status === "scheduled").toBeTruthy();

    await pageA.getByRole("button", { name: /end call/i }).click();
    await expect(pageA.getByRole("button", { name: /^call$/i })).toBeVisible({ timeout: 30000 });
    await ctxA.close();
    await ctxB.close();
  });

  test("web to desktop chat shell lifecycle + duplicate-click guard", async ({ page }) => {
    test.skip(!USER_A_EMAIL || !USER_A_PASSWORD, "PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD are required");
    await installMediaMocks(page);
    await login(page, USER_A_EMAIL, USER_A_PASSWORD);
    const conversationId = await openChatConversation(page);

    const callButton = page.getByRole("button", { name: /^call$/i });
    await callButton.click();
    await callButton.click();
    const joinNow = page.getByRole("button", { name: /join now/i });
    if (await joinNow.isVisible().catch(() => false)) {
      await joinNow.click();
    }
    await expect(page.getByRole("button", { name: /end call/i })).toBeVisible({ timeout: 30000 });

    const startedMessages = page.getByText("Call started.", { exact: true });
    await expect(startedMessages.first()).toBeVisible({ timeout: 15000 });
    await expect(startedMessages).toHaveCount(1);

    await page.getByRole("button", { name: /end call/i }).click();
    await expect(page.getByRole("button", { name: /^call$/i })).toBeVisible({ timeout: 30000 });

    const stateRes = await page.request.get(`/api/chat/conversations/${conversationId}/calls/state`);
    expect(stateRes.ok()).toBeTruthy();
  });
});
