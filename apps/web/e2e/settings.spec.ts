import {
  test,
  web,
  capture,
  signedInAccount,
  webShellFixture,
  preferencesPersist,
  authResponse,
} from "@raypx/e2e/testing";
import { expect, type Page } from "@playwright/test";

async function signedInAccountWithPassword(page: Page) {
  const user = await signedInAccount(page);
  await page.route("**/api/auth/list-accounts", (route) =>
    authResponse(route, [{ providerId: "credential", userId: user.id }]),
  );
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
  "Web account settings present profile, sessions and instance registration with scoped actions",
  { tag: "@web" },
  async ({ page }) => {
    await webShellFixture(page);
    const user = await signedInAccount(page);
    const session = {
      userId: user.id,
      expiresAt: "2026-12-10T09:00:00.000Z",
      createdAt: "2026-11-09T09:00:00.000Z",
      updatedAt: "2026-11-09T09:00:00.000Z",
      ipAddress: "192.0.2.10",
    };
    await page.route("**/api/auth/list-sessions", (route) =>
      authResponse(route, [
        {
          ...session,
          id: "other-session",
          token: "fixture-private-other-session",
          userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36",
        },
        {
          ...session,
          id: "desktop-session",
          token: "fixture-private-current-session",
          userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1",
        },
      ]),
    );
    const revoked: Record<string, unknown>[] = [];
    await page.route("**/api/auth/revoke-session", (route) => {
      revoked.push(route.request().postDataJSON() as Record<string, unknown>);
      return authResponse(route, { status: true });
    });
    const identity = {
      instanceId: "655c58f4-4c7a-4a93-81d3-6205c6192c01",
      publicKey: "browser-fixture-public-key-value-00000000",
      name: "Development Mac",
      platform: "darwin",
      appVersion: "0.1.0",
    };
    await page.route("**/rpc/instances/list", (route) =>
      authResponse(route, {
        json: [
          {
            ...identity,
            version: 1,
            origin: "https://raypx.example",
            accountId: user.id,
            revision: 1,
            status: "registered",
            issuedAt: "2026-11-09T09:00:00.000Z",
          },
        ],
      }),
    );
    await page.route("**/rpc/instances/inspect", (route) =>
      authResponse(route, { json: identity }),
    );
    await page.goto(`${web}/settings#settings/account`);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue(
      user.name,
    );
    await capture(page, {
      path: test.info().outputPath("account-profile.png"),
      fullPage: true,
      animations: "disabled",
    });
    await settings.getByRole("tab", { name: "Signed-in sessions", exact: true }).click();
    const sessions = settings.getByRole("tabpanel");
    await expect(
      sessions.getByRole("heading", { name: "Safari · macOS", exact: true }),
    ).toBeVisible();
    await expect(sessions.getByText("This session", { exact: true })).toBeVisible();
    await expect(sessions).not.toContainText("fixture-private-");
    await capture(page, {
      path: test.info().outputPath("account-sessions.png"),
      fullPage: true,
      animations: "disabled",
    });
    await sessions.getByRole("button", { name: "Sign out session", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Sign out session", exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Sign out session", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(
      sessions.getByRole("heading", { name: "Chrome · Windows", exact: true }),
    ).toHaveCount(0);
    expect(revoked).toEqual([{ token: "fixture-private-other-session" }]);
    await settings.getByRole("tab", { name: "Registered instances", exact: true }).click();
    await expect(
      settings.getByRole("heading", { name: "Development Mac", exact: true }),
    ).toBeVisible();
    await settings.getByRole("textbox", { name: "Instance code", exact: true }).fill("ABCDEFGH23");
    await settings.getByRole("button", { name: "Review instance", exact: true }).click();
    await expect(
      settings.getByRole("button", { name: "Approve registration", exact: true }),
    ).toBeVisible();
    await capture(page, {
      path: test.info().outputPath("instance-registration.png"),
      fullPage: true,
      animations: "disabled",
    });
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
    await signedInAccountWithPassword(page);
    await page.goto(`${web}/settings`);
    const language = page.getByRole("combobox", { name: "Language", exact: true });
    await expect(language).toBeVisible();
    await language.evaluate((element) =>
      element.setAttribute("data-background-check", "preserved"),
    );
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    const passwordTab = dialog.getByRole("tab", { name: "Password", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(`${web}/settings#settings/account`);
    const name = dialog.getByLabel("Display name", { exact: true });
    await name.fill("Unsaved account draft");
    await passwordTab.click();
    await expect(page).toHaveURL(`${web}/settings#settings/password`);
    await dialog.getByRole("tab", { name: "Account", exact: true }).click();
    await expect(name).toHaveValue("Unsaved account draft");
    await passwordTab.click();
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(`${web}/settings`);
    await expect(language).toHaveAttribute("data-background-check", "preserved");
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeFocused();
    await page.goForward();
    await expect(dialog).toBeVisible();
    await expect(passwordTab).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await expect(dialog).toBeVisible();
    await expect(passwordTab).toHaveAttribute("aria-selected", "true");
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
    passwordCategory: "Password",
    changePassword: "Change password",
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
    passwordCategory: "密码",
    changePassword: "修改密码",
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
      await signedInAccountWithPassword(page);
      await page.goto(`${web}/settings`);
      await page.getByRole("button", { name: layout.menu, exact: true }).click();
      await page.getByRole("menuitem", { name: layout.account, exact: true }).click();
      const settings = page.getByRole("dialog", { name: layout.settings, exact: true });
      const search = settings.getByRole("searchbox", { name: layout.search, exact: true });
      await search.fill("password");
      await settings
        .getByRole("navigation", { name: layout.results, exact: true })
        .getByRole("button", { name: layout.passwordCategory, exact: true })
        .click();
      const trigger = settings
        .getByRole("tabpanel")
        .getByRole("button", { name: layout.changePassword, exact: true });
      await expect(settings.getByLabel(layout.current, { exact: true })).toHaveCount(0);
      await search.fill("password");
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: layout.changePassword, exact: true });
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
