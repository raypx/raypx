import { expect, test } from "@playwright/test";

test("protects the integrated Admin user directory", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login\?redirect=.*admin/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
