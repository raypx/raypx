import {
  test,
  web,
  capture,
  signedInAccount,
  webShellFixture,
  preferencesPersist,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

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
  "Web settings anchors preserve the background, history and selected category on reload",
  { tag: "@web" },
  async ({ page }) => {
    await webShellFixture(page);
    await signedInAccount(page);
    await page.goto(`${web}/settings`);
    const language = page.getByRole("combobox", { name: "Language", exact: true });
    await expect(language).toBeVisible();
    await language.evaluate((element) =>
      element.setAttribute("data-background-check", "preserved"),
    );
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(`${web}/settings#settings/account`);
    const name = dialog.getByLabel("Display name", { exact: true });
    await name.fill("Unsaved account draft");
    await dialog.getByRole("tab", { name: "Change password", exact: true }).click();
    await expect(page).toHaveURL(`${web}/settings#settings/password`);
    await dialog.getByRole("tab", { name: "Account", exact: true }).click();
    await expect(name).toHaveValue("Unsaved account draft");
    await dialog.getByRole("tab", { name: "Change password", exact: true }).click();
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(`${web}/settings`);
    await expect(language).toHaveAttribute("data-background-check", "preserved");
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeFocused();
    await page.goForward();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Change password", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.reload();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Change password", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(`${web}/settings`);
    await page.goto(`${web}/settings#settings/preferences`);
    await expect(dialog.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(`${web}/settings`);
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
      await expect(page).toHaveURL(`${web}/settings#settings/password`);
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
