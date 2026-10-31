import { expect } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import { surfaces } from "./helpers/surfaces.js";
import { capture } from "./helpers/capture.js";
import { authResponse, signedInAccount, webShellFixture } from "./helpers/account-fixture.js";

import type { HumanRequest } from "@raypx/core/tasks";

for (const [surface, base] of surfaces) {
  test(
    `${surface} groups sidebar menus and keeps collapsed navigation accessible`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      const user = await signedInAccount(page);
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
      await page.goto(`${base}/settings`);
      const sidebar = page.getByRole("complementary");
      const workspace = sidebar.getByRole("group", { name: "Workspace", exact: true });
      await expect(workspace.getByRole("link", { name: "Tasks", exact: true })).toBeVisible();
      const waiting = workspace.getByRole("link", { name: /^Waiting/ });
      await expect(waiting).toContainText("1");
      if (surface === "Desktop") {
        const local = sidebar.getByRole("group", { name: "Local tools", exact: true });
        await expect(local.getByRole("link", { name: "Files", exact: true })).toBeVisible();
        await expect(local.getByRole("link", { name: "Automations", exact: true })).toBeVisible();
      }
      await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
      const expanded = (await sidebar.boundingBox())!;
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
      await expect(expand).toHaveAttribute("aria-expanded", "false");
      expect((await sidebar.boundingBox())!.width).toBe(64);
      expect(expanded.width).toBeGreaterThan(190);
      await expect(waiting.getByText("1", { exact: true })).toBeInViewport();
      const tasks = workspace.getByRole("link", { name: "Tasks", exact: true });
      await tasks.focus();
      // Tooltips follow visible keyboard focus rather than focus moved by a pointer action.
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(tasks).toBeFocused();
      // Base UI tooltips are visual labels; the link itself retains its accessible name.
      const hint = page.locator('[data-slot="tooltip-content"]').filter({ hasText: /^Tasks$/ });
      await expect(hint).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(hint).not.toBeVisible();
      await page.reload();
      await expect(expand).toHaveAttribute("aria-expanded", "false");
      expect((await sidebar.boundingBox())!.width).toBe(64);
      await page.setViewportSize({ width: 760, height: 900 });
      await tasks.hover();
      await expect(hint).toBeVisible();
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1280, height: 900 });
      const account = sidebar.getByRole("button", { name: "Account menu", exact: true });
      await expect(account.getByText(user.email, { exact: true })).toBeHidden();
      await account.click();
      const menu = page.getByRole("menu", { name: "Account menu", exact: true });
      await expect(menu.getByRole("menuitem", { name: "Settings", exact: true })).toBeVisible();
      const menuBox = (await menu.boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
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
      expect((await sidebar.boundingBox())!.width).toBe(expanded.width);
      await capture(page, {
        path: test.info().outputPath("sidebar-expanded.png"),
        fullPage: true,
        animations: "disabled",
      });
    },
  );

  test(
    `${surface} account menu supports keyboard, localization, avatar and sign-out recovery`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      let signedIn = true;
      let attempts = 0;
      const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#333"/><circle cx="16" cy="12" r="5" fill="#fff"/><path d="M6 30a10 10 0 0 1 20 0" fill="#fff"/></svg>')}`;
      const user = {
        id: "menu-fixture",
        name: "Ada Lovelace",
        email: "ada@example.test",
        image,
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
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
      await page.goto(`${base}/settings`);
      await test.step("keyboard, viewport and localized menu", async () => {
        const trigger = page.getByRole("button", { name: "Account menu", exact: true });
        await expect(trigger).toBeVisible();
        await expect(trigger).toBeEnabled();
        await trigger.focus();
        await page.keyboard.press("Enter");
        const menu = page.getByRole("menu", { name: "Account menu", exact: true });
        await expect(menu.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
        const bounds = await menu.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
        await capture(page, {
          path: test.info().outputPath("account-menu.png"),
          fullPage: true,
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
        await expect(menu).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
        await expect(page).toHaveURL(`${base}/settings`);
        await page.getByRole("radio", { name: "Dark", exact: true }).check();
        await page.getByRole("combobox", { name: "Language", exact: true }).click();
        await page.getByRole("option", { name: "简体中文", exact: true }).click();
        await page.getByRole("button", { name: "账号菜单", exact: true }).click();
        await expect(page.getByRole("menuitem", { name: "设置", exact: true })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "退出登录", exact: true })).toBeVisible();
        await capture(page, {
          path: test.info().outputPath("account-menu-dark-zh.png"),
          fullPage: true,
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
        await page.getByRole("combobox", { name: "语言", exact: true }).click();
        await page.getByRole("option", { name: "English", exact: true }).click();
        await page.getByRole("radio", { name: "Light", exact: true }).check();
        if (surface === "Web") await page.setViewportSize({ width: 1280, height: 720 });
      });
      await test.step("avatar and failed sign-out recovery", async () => {
        const trigger = page.getByRole("button", { name: "Account menu", exact: true });
        await expect(trigger).toContainText(user.name);
        await expect(trigger.locator("img")).toHaveAttribute("src", image);
        await trigger.click();
        const menu = page.getByRole("menu", { name: "Account menu", exact: true });
        await expect(menu.getByText(user.email, { exact: true })).toBeVisible();
        await capture(page, {
          path: test.info().outputPath("account-menu-signed-in.png"),
          fullPage: true,
          animations: "disabled",
        });
        await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
        await expect(menu.getByRole("alert")).toHaveText(
          "Unable to connect. Check your connection and try again.",
        );
        await expect(menu.getByText("private diagnostic")).toHaveCount(0);
        await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
        await expect(page).toHaveURL(base + "/");
        await expect(
          page.getByRole("heading", {
            name: surface === "Web" ? "Remote tasks and approvals" : "Your local files",
            exact: true,
          }),
        ).toBeVisible();
        if (surface === "Desktop") await expect(trigger).toBeVisible();
        expect(attempts).toBe(2);
      });
    },
  );
}
