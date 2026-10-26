import { expect, type Page } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import { web, desktop } from "./helpers/surfaces.js";
import { capture } from "./helpers/capture.js";
import { signedInAccount, webShellFixture } from "./helpers/account-fixture.js";

async function preferencesPersist(page: Page, base: string) {
  await page.goto(`${base}/settings`);
  await expect(page.getByRole("heading", { name: "Make it yours" })).toBeVisible();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "按你的习惯设置" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("combobox", { name: "语言", exact: true })).toContainText("简体中文");
  await expect(page.getByRole("radio", { name: "深色", exact: true })).toBeChecked();
  await capture(page, {
    path: test
      .info()
      .outputPath(base === web ? "web-settings-dark-zh.png" : "desktop-settings-dark-zh.png"),
    fullPage: true,
  });
}

test(
  "Web preserves local appearance and language preferences with an account fixture",
  { tag: "@web" },
  async ({ page }) => {
    await webShellFixture(page);
    await signedInAccount(page);
    await preferencesPersist(page, web);
  },
);

test(
  "Web settings remain usable on a narrow screen without horizontal overflow",
  { tag: "@web" },
  async ({ page }) => {
    await webShellFixture(page);
    await signedInAccount(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${web}/settings`);
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "Light", exact: true }).check();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("link", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  },
);

test(
  "Desktop preview states local unavailability after sign-in",
  { tag: "@desktop" },
  async ({ page }) => {
    const user = await signedInAccount(page);
    await page.goto(desktop);
    await expect(
      page.getByRole("heading", { name: "Your local files", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Open the desktop app to use local tools.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose folder", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Start with a folder", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => "__electrobunWebviewId" in window)).toBe(false);
    await page.getByRole("link", { name: "Automations", exact: true }).click();
    await expect(page).toHaveURL(`${desktop}/automations`);
    await expect(
      page.getByRole("heading", { name: "Keep things moving", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Open the desktop app to use local tools.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New automation", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: user.name, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await preferencesPersist(page, desktop);
  },
);
