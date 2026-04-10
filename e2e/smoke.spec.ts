import { test, expect } from "@playwright/test";

test.describe("public shell smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  });
});
