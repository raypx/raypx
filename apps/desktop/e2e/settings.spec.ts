import { test, desktop, signedInAccount, preferencesPersist, capture } from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Desktop keeps account security and device preferences reachable from Agents",
  { tag: "@desktop" },
  async ({ page }) => {
    const user = await signedInAccount(page);
    await page.goto(`${desktop}/agents`);
    await expect(
      page.getByRole("heading", { name: "Create a Space to get started.", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: user.name, exact: true })).toBeVisible();
    await capture(page, { path: test.info().outputPath("desktop-account.png"), fullPage: true });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    await preferencesPersist(page, desktop);
  },
);
