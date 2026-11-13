import { test, desktop, signedInAccount, preferencesPersist } from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Desktop keeps account security and device preferences reachable from Agents",
  { tag: "@desktop" },
  async ({ page }) => {
    const user = await signedInAccount(page);
    await page.goto(`${desktop}/agents`);
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: user.name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    await preferencesPersist(page, desktop);
  },
);
