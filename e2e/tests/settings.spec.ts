import { expect, type Page } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import { web, desktop } from "./helpers/surfaces.js";
import { capture } from "./helpers/capture.js";
import { signedInAccount, webShellFixture } from "./helpers/account-fixture.js";

async function preferencesPersist(page: Page, base: string) {
  await page.goto(`${base}/settings`);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  // The visible theme card activates its visually hidden radio.
  await page.getByText("Dark", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    await page.getByText("Light", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeChecked();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  },
);

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
    expect(await page.evaluate(() => "__TAURI_INTERNALS__" in window)).toBe(false);
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

for (const layout of [
  {
    locale: "en",
    width: 1280,
    height: 800,
    menu: "Account menu",
    account: "Account",
    settings: "Settings",
    search: "Search settings",
    results: "Matching settings",
    password: "Change password",
    current: "Current password",
    cancel: "Cancel",
  },
  {
    locale: "zh",
    width: 390,
    height: 700,
    menu: "账号菜单",
    account: "账号",
    settings: "设置",
    search: "搜索设置",
    results: "匹配的设置",
    password: "修改密码",
    current: "当前密码",
    cancel: "取消",
  },
] as const) {
  test(
    `Web password dialog preserves settings on dismissal (${layout.locale}, ${layout.width}px)`,
    { tag: "@web" },
    async ({ page }) => {
      await page.setViewportSize({ width: layout.width, height: layout.height });
      await page.addInitScript(
        (locale) => localStorage.setItem("raypx_locale", locale),
        layout.locale,
      );
      await webShellFixture(page);
      await signedInAccount(page);
      await page.goto(`${web}/settings`);
      await page.getByRole("button", { name: layout.menu, exact: true }).click();
      await page.getByRole("menuitem", { name: layout.account, exact: true }).click();
      const settings = page.getByRole("dialog", { name: layout.settings, exact: true });
      const search = settings.getByRole("searchbox", { name: layout.search, exact: true });
      await search.fill("password");
      await settings
        .getByRole("navigation", { name: layout.results, exact: true })
        .getByRole("button", { name: layout.password, exact: true })
        .click();
      const trigger = settings
        .getByRole("tabpanel")
        .getByRole("button", { name: layout.password, exact: true });
      await expect(settings.getByLabel(layout.current, { exact: true })).toHaveCount(0);
      await search.fill("password");
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: layout.password, exact: true });
      const current = dialog.getByLabel(layout.current, { exact: true });
      await expect(current).toBeFocused();
      const bounds = await dialog.boundingBox();
      expect(bounds?.width).toBeLessThanOrEqual(Math.min(448, layout.width - 32));
      expect(bounds?.height).toBeLessThanOrEqual(layout.height * 0.9 + 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await capture(page, {
        path: test.info().outputPath(`password-dialog-${layout.locale}-${layout.width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await current.fill("temporary browser fixture");
      await current.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
      await expect(search).toHaveValue("password");
      await expect(trigger).toBeFocused();
      await expect(page).toHaveURL(`${web}/account`);
      await trigger.click();
      await expect(current).toHaveValue("");
      await dialog.getByRole("button", { name: layout.cancel, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
      await trigger.click();
      await page.mouse.click(8, 8);
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
      await expect(search).toHaveValue("password");
    },
  );
}
