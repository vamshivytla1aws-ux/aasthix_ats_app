import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test.describe("executive calm public experience", () => {
  test("login presents the branded workspace clearly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("careers provides responsive discovery", async ({ page }) => {
    await page.goto("/careers");
    await expect(page.getByRole("heading", { name: "Build meaningful work with AASTHIX" })).toBeVisible();
    await expect(page.getByPlaceholder("Search roles or locations")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
