import { expect } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import { capture } from "../helpers/capture.js";
import {
  accountAccessFixture,
  authResponse,
  signedInAccount,
  webShellFixture,
} from "../helpers/account-fixture.js";

import type { HumanRequest } from "@raypx/core/tasks";

/** Register the shared journey in the owning application's Playwright file. */
export function registerTests() {
  test(`groups sidebar menus and keeps collapsed navigation accessible`, async ({
    page,
    surface,
    base,
  }) => {
    if (surface === "Web") await webShellFixture(page);
    await signedInAccount(page);
    await page.route("**/rpc/approvals/list", (route) =>
      authResponse(route, {
        json: [
          {
            id: crypto.randomUUID(),
            taskId: crypto.randomUUID(),
            kind: "permission",
            title: "Check sidebar badge",
            body: "",
            questions: [],
            status: "pending",
            decision: null,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          } satisfies HumanRequest,
        ],
      }),
    );
    await page.goto(`${base}${surface === "Web" ? "/projects" : "/"}`);
    await test.step("shows the skip link only on keyboard focus", async () => {
      const skip = page.getByRole("link", { name: "Skip navigation", exact: true });
      await expect(skip).toBeAttached();
      await expect(skip).not.toBeInViewport();
      await page.keyboard.press("Tab");
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Tab");
      await expect(skip).not.toBeInViewport();
    });
    const sidebar = page.getByRole("complementary");
    const navigation = sidebar.getByRole("navigation", { name: "Raypx", exact: true });
    const workspace = navigation.getByRole("group", { name: "Workspace", exact: true });
    await expect(workspace.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
    const waiting = workspace.getByRole("link", { name: /^Waiting/ });
    await expect(waiting).toContainText("1");
    if (surface === "Desktop") {
      const local = sidebar;
      await expect(
        local.getByRole("link", { name: "Memory and templates", exact: true }),
      ).toBeVisible();
      await expect(local.getByRole("link", { name: "Automations", exact: true })).toBeVisible();
    }
    await expect(workspace.getByRole("link", { name: "Projects", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(workspace.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
    await page.reload();
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    const account = sidebar.getByRole("button", { name: "Account menu", exact: true });
    await account.click();
    const menu = page.getByRole("menu", { name: "Account menu", exact: true });
    await expect(menu.getByRole("menuitem", { name: "Account", exact: true })).toBeVisible();
    await capture(page, {
      path: test.info().outputPath("sidebar-collapsed-menu.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(account).toBeFocused();
    await expand.click();
    await expect(
      page.getByRole("button", { name: "Collapse sidebar", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await capture(page, {
      path: test.info().outputPath("sidebar-expanded.png"),
      fullPage: true,
      animations: "disabled",
    });
  });

  test(`account menu supports keyboard, localization and sign-out recovery`, async ({
    page,
    surface,
    base,
  }) => {
    if (surface === "Web") await webShellFixture(page);
    let signedIn = true;
    let attempts = 0;
    const user = {
      id: "menu-fixture",
      name: "Ada Lovelace",
      email: "ada@example.test",
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await accountAccessFixture(page, user.id);
    await page.route("**/rpc/approvals/list", (route) => authResponse(route, { json: [] }));
    await page.route("**/rpc/devices/list", (route) => authResponse(route, { json: [] }));
    await page.route("**/api/auth/get-session**", (route) =>
      authResponse(
        route,
        signedIn
          ? {
              user,
              session: {
                id: "menu-session",
                userId: user.id,
                token: "browser-fixture-only",
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
              },
            }
          : null,
      ),
    );
    await page.route("**/rpc/account/get", (route) =>
      signedIn
        ? authResponse(route, { json: { id: user.id, name: user.name, email: user.email } })
        : authResponse(
            route,
            {
              json: { defined: false, code: "UNAUTHORIZED", message: "Authentication required" },
            },
            401,
          ),
    );
    await page.route("**/api/auth/sign-out", async (route) => {
      attempts++;
      if (attempts === 1)
        return authResponse(
          route,
          { code: "TEST_UNAVAILABLE", message: "private diagnostic" },
          500,
        );
      signedIn = false;
      await page.context().clearCookies();
      return authResponse(route, { success: true });
    });
    if (surface === "Web") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}${surface === "Web" ? "/settings" : "/"}`);
    await test.step("keyboard and localized menu", async () => {
      const trigger = page.getByRole("button", { name: "Account menu", exact: true });
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeEnabled();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu", { name: "Account menu", exact: true });
      await expect(menu.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
      await capture(page, {
        path: test.info().outputPath("account-menu.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await page
        .getByRole("complementary")
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await expect(page).toHaveURL(`${base}${surface === "Web" ? "/settings" : "/#settings"}`);
      const settings = page.getByRole("dialog");
      await expect(settings).toBeVisible();
      await settings.getByText("Dark", { exact: true }).click();
      await settings.getByRole("combobox", { name: "Language", exact: true }).click();
      await page.getByRole("option", { name: "简体中文", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(settings).toBeHidden();
      await page.getByRole("button", { name: "账号菜单", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menuitem", { name: "账号", exact: true })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "退出登录", exact: true })).toBeVisible();
      await capture(page, {
        path: test.info().outputPath("account-menu-dark-zh.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      if (surface === "Desktop")
        await page
          .getByRole("complementary")
          .getByRole("button", { name: "设置", exact: true })
          .click();
      await page.getByRole("combobox", { name: "语言", exact: true }).click();
      await page.getByRole("option", { name: "English", exact: true }).click();
      await page.getByText("Light", { exact: true }).click();
      if (surface === "Desktop") {
        await page.keyboard.press("Escape");
        await expect(settings).toBeHidden();
      }
    });
    await test.step("retry sign-out and return to the signed-out home", async () => {
      const trigger = page.getByRole("button", { name: "Account menu", exact: true });
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Account menu", exact: true });
      await expect(menu.getByText(user.email, { exact: true })).toBeVisible();
      await capture(page, {
        path: test.info().outputPath("account-menu-signed-in.png"),
        fullPage: true,
        animations: "disabled",
      });
      await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
      await expect(menu.getByRole("alert")).toBeVisible();
      await expect(menu.getByText("private diagnostic")).toHaveCount(0);
      await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(base + "/");
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      await expect(trigger).toHaveCount(0);
      expect(attempts).toBe(2);
    });
  });
}
