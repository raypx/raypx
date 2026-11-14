import { expect, type Page } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import { expectSurfaceAtRest, expectSurfaceControls } from "../helpers/geometry.js";
import { capture } from "../helpers/capture.js";
import {
  accountAccessFixture,
  authResponse,
  signedInAccount,
  webShellFixture,
} from "../helpers/account-fixture.js";

/** The first Agent belongs to an existing Space; no conversation or provider is fabricated. */
async function emptyAgentsSpace(page: Page, accountId: string) {
  const spaceId = "11111111-1111-4111-8111-111111111111";
  const createdAt = "2026-11-13T00:00:00.000Z";
  await page.route("**/rpc/spaces/list", (route) =>
    authResponse(route, {
      json: [
        {
          space: { id: spaceId, name: "Personal", createdAt, updatedAt: createdAt },
          member: { spaceId, accountId, role: "owner", createdAt },
        },
      ],
    }),
  );
  await page.route("**/rpc/conversations/listGroups", (route) => authResponse(route, { json: [] }));
  await page.route("**/rpc/agents/list", (route) => authResponse(route, { json: [] }));
  await page.route("**/rpc/agents/models", (route) =>
    authResponse(route, { json: [{ modelId: "fixture", name: "Fixture model" }] }),
  );
  await page.route("**/rpc/computers/get", (route) =>
    authResponse(route, { json: { status: "not-configured" } }),
  );
}

/** Register the shared journey in the owning application's Playwright file. */
export function registerTests() {
  test(`keeps current sidebar destinations and collapsed navigation accessible`, async ({
    page,
    surface,
    base,
  }) => {
    if (surface === "Web") await webShellFixture(page);
    const user = await signedInAccount(page);
    await emptyAgentsSpace(page, user.id);
    await page.goto(`${base}/agents`);
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
    await expect(sidebar.getByRole("button", { name: "Space", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Space", exact: true })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /^(?:New Agent|Create Agent)$/, exact: true }),
    ).toHaveCount(1);
    await expect(
      sidebar.getByRole("button", { name: /^(?:New Agent|Create Agent)$/, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New group", exact: true })).toHaveCount(1);
    await expect(sidebar.getByRole("button", { name: "New group", exact: true })).toBeVisible();
    await expectSurfaceControls(page, sidebar);
    await expect(navigation.getByRole("group", { name: "Workspace", exact: true })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Pages", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Agents", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "New", exact: true })).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: "Memory and templates", exact: true }),
    ).toHaveCount(0);
    for (const name of ["Projects", "Waiting", "Automations", "New session"])
      await expect(sidebar.getByRole("link", { name, exact: true })).toHaveCount(0);
    await expect(
      page.locator("[data-workspace-home]").getByRole("heading", { level: 1 }),
    ).toHaveText("What would you like to work on?");
    await navigation.getByRole("link", { name: "Pages", exact: true }).click({ timeout: 5000 });
    await expect(navigation.getByRole("link", { name: "Pages", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByRole("link", { name: "Raypx", exact: true }).click({ timeout: 5000 });
    await expect(page.locator("[data-workspace-home]")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expectSurfaceControls(page, sidebar);
    for (const name of ["Space", "New group", "Tools", "Account menu"]) {
      const icon = sidebar.getByRole("button", { name, exact: true });
      await icon.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(icon).toBeFocused();
      await expect(page.getByRole("tooltip", { name, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip", { name, exact: true })).toBeHidden();
    }
    for (const [action, title] of [
      ["Create Agent", "New Agent"],
      ["New group", "New group"],
    ] as const) {
      const opener = page.getByRole("button", { name: action, exact: true });
      await expect(opener).toBeVisible();
      await opener.click({ timeout: 5000 });
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expectSurfaceAtRest(page, dialog);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
    }
    await expect(navigation.getByRole("link", { name: "Pages", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Agents", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "New", exact: true })).toBeVisible();
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

  for (const locale of ["en", "zh"] as const) {
    test(`Agents shell fits narrow and wide screens in ${locale}`, async ({
      page,
      surface,
      base,
    }) => {
      if (surface === "Web") await webShellFixture(page);
      const user = await signedInAccount(page);
      await emptyAgentsSpace(page, user.id);
      await page.addInitScript(
        (language) => localStorage.setItem("raypx_locale", language),
        locale,
      );
      await page.goto(`${base}/agents`);
      const title = locale === "zh" ? "智能体" : "Agents";
      const space = locale === "zh" ? "空间" : "Space";
      const newAgent = locale === "zh" ? "创建智能体" : "Create Agent";
      const agentDialog = locale === "zh" ? "新建智能体" : "New Agent";
      const newGroup = locale === "zh" ? "新建群组" : "New group";
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 812 });
        await expect(
          page.locator("[data-workspace-home]").getByRole("heading", { level: 1 }),
        ).toHaveCount(1);
        await expect(
          page.getByRole("complementary").getByRole("link", { name: title, exact: true }),
        ).toHaveCount(0);
        await expect(page.getByRole("button", { name: space, exact: true })).toHaveCount(1);
        await expect(
          page.getByRole("complementary").getByRole("button", { name: space, exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: newAgent, exact: true })).toHaveCount(1);
        const sidebar = page.getByRole("complementary");
        await expect(page.getByRole("button", { name: newGroup, exact: true })).toHaveCount(1);
        for (const name of [newAgent, newGroup]) {
          const opener = page.getByRole("button", { name, exact: true });
          await expect(opener).toBeVisible();
          await opener.click({ timeout: 5000 });
          const dialog = page.getByRole("dialog", {
            name: name === newAgent ? agentDialog : newGroup,
            exact: true,
          });
          await expectSurfaceAtRest(page, dialog);
          await page.keyboard.press("Escape");
          await expect(dialog).toBeHidden();
          await expect(opener).toBeFocused();
        }
        await expectSurfaceControls(page, sidebar);
        await capture(page, {
          path: test.info().outputPath(`agents-shell-${locale}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    });
  }

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
    await page.route("**/rpc/spaces/list", (route) => authResponse(route, { json: [] }));
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
    await page.goto(`${base}${surface === "Web" ? "/settings" : "/agents"}`);
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
      await expect(page).toHaveURL(
        `${base}${surface === "Web" ? "/settings" : "/agents#settings"}`,
      );
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
      await expect(page).toHaveURL(surface === "Web" ? base + "/" : /\/login(?:\?|$)/);
      await expect(
        page.getByRole("button", {
          name: surface === "Web" ? "Sign in" : "Sign in with browser",
          exact: true,
        }),
      ).toBeVisible();
      await expect(trigger).toHaveCount(0);
      expect(attempts).toBe(2);
    });
  });
}
