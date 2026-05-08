import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "";
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || "";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|pipeline|candidates|jobs)/, { timeout: 30000 });
}

test.describe("desktop freeze guard", () => {
  test("desktop shell keeps desktop nav path", async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, "PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD are required");
    await page.setViewportSize({ width: 1366, height: 900 });
    await login(page);

    const openMenu = page.getByRole("button", { name: /open menu/i });
    await expect(openMenu).toBeHidden();

    for (const route of ["/dashboard", "/pipeline", "/jobs", "/candidates", "/interviews", "/chat", "/alerts"]) {
      await page.goto(route);
      await expect(page.getByRole("navigation", { name: /workspace modules/i })).toBeVisible();
    }
  });
});

