import { expect } from "@playwright/test";
import { test, desktop, signedInAccount, preferencesPersist } from "@raypx/e2e/testing";

test(
  "Desktop preview states local unavailability after sign-in",
  { tag: "@desktop" },
  async ({ page }) => {
    const user = await signedInAccount(page);
    await page.goto(`${desktop}/files`);
    await expect(page.getByRole("heading", { name: "Files", exact: true })).toBeVisible();
    await expect(
      page.getByText("Open the desktop app to use local tools.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose folder", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Start with a folder", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => "__raypxDesktopHost" in window)).toBe(false);
    await page.getByRole("link", { name: "Automations", exact: true }).click();
    await expect(page).toHaveURL(`${desktop}/automations`);
    await expect(page.getByRole("heading", { name: "Automations", exact: true })).toBeVisible();
    await expect(
      page.getByText("Open the desktop app to use local tools.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New automation", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: user.name, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await preferencesPersist(page, desktop);
  },
);
