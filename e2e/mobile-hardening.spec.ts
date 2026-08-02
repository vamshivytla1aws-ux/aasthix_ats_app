import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 900 },
  { width: 360, height: 900 },
  { width: 375, height: 900 },
  { width: 414, height: 896 },
];

const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "";
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || "";

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > window.innerWidth + 1;
  });
  expect(overflow).toBeFalsy();
}

test.describe("mobile-only hardening", () => {
  for (const vp of VIEWPORTS) {
    test(`public pages keep actions reachable at ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
      await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.goto("/careers");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });

    test(`session and drawer flow at ${vp.width}px`, async ({ page }) => {
      test.skip(!TEST_EMAIL || !TEST_PASSWORD, "PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD are required");
      await page.setViewportSize(vp);
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(TEST_EMAIL);
      await page.getByLabel(/password/i).fill(TEST_PASSWORD);
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await expect(page).toHaveURL(/\/(dashboard|pipeline|candidates|jobs)/, { timeout: 30000 });

      const openMenu = page.getByRole("button", { name: /open menu/i });
      await expect(openMenu).toBeVisible();
      await openMenu.click();
      await expect(page.getByRole("link", { name: /pipeline/i })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.getByRole("link", { name: /pipeline/i })).toBeHidden();

      await openMenu.click();
      await page.getByRole("link", { name: /pipeline/i }).click();
      await expect(page).toHaveURL(/\/pipeline/);

      await page.goto("/jobs");
      await expect(page).toHaveURL(/\/jobs/);
      await page.goto("/candidates");
      await expect(page).toHaveURL(/\/candidates/);

      await openMenu.click();
      await page.getByRole("button", { name: /^logout$/i }).click();
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
