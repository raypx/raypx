import { expect } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import {
  signedInAccount,
  accountAccessFixture,
  authResponse,
  webShellFixture,
} from "./helpers/account-fixture.js";
import { capture } from "./helpers/capture.js";
import { web } from "./helpers/surfaces.js";

for (const width of [360, 768, 1440])
  for (const locale of ["en", "zh"])
    for (const theme of ["light", "dark"]) {
      test(
        `Web account header ${width}px ${locale} ${theme}`,
        { tag: "@web" },
        async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.addInitScript(
            (preferences) => {
              localStorage.setItem("raypx_locale", preferences.locale);
              localStorage.setItem("theme", preferences.theme);
            },
            { locale, theme },
          );
          const account = await signedInAccount(page);
          await accountAccessFixture(page, account.id, "admin");
          await page.goto(web);
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await expect(
            page.getByRole("contentinfo").getByRole("link", { name: "GitHub" }),
          ).toBeVisible();
          const button = page.getByRole("button", {
            name: locale === "zh" ? "账号菜单" : "Account menu",
            exact: true,
          });
          await button.focus();
          await page.keyboard.press("Enter");
          await expect(
            page.getByRole("menuitem", {
              name: locale === "zh" ? "管理控制台" : "Admin console",
              exact: true,
            }),
          ).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await capture(page, {
            path: test.info().outputPath(`header-${width}-${locale}-${theme}.png`),
            fullPage: true,
          });
          await page.keyboard.press("Escape");
          await expect(button).toBeFocused();
        },
      );
    }
for (const width of [360, 1440]) {
  test(`Web user role confirmation and search ${width}px`, { tag: "@web" }, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await webShellFixture(page);
    const account = await signedInAccount(page);
    await accountAccessFixture(page, account.id, "admin");
    const users = [
      { ...account, role: "admin", createdAt: "2026-11-01T00:00:00Z" },
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `member-${index}`,
        name: `Member ${index}`,
        email: `member-${index}@example.test`,
        role: "member",
        emailVerified: true,
        createdAt: "2026-11-01T00:00:00Z",
      })),
    ];
    const searches: string[] = [];
    const changes: unknown[] = [];
    let fail = true;
    await page.route("**/api/auth/admin/list-users**", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const query = new URL(route.request().url()).searchParams;
      searches.push(query.toString());
      const search = query.get("searchValue") ?? "";
      const field = query.get("searchField") === "name" ? "name" : "email";
      const matches = users.filter((user) => user[field].includes(search));
      const offset = Number(query.get("offset") ?? 0);
      return authResponse(route, {
        users: matches.slice(offset, offset + 20),
        total: matches.length,
      });
    });
    await page.route("**/api/auth/admin/set-role", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const body = route.request().postDataJSON() as { userId: string; role: string };
      changes.push(body);
      if (fail) {
        fail = false;
        return authResponse(route, { code: "TEST_FAILURE", message: "private diagnostic" }, 500);
      }
      const user = users.find((candidate) => candidate.id === body.userId)!;
      user.role = body.role;
      return authResponse(route, { user });
    });
    await page.goto(web);
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Admin console", exact: true }).click();
    await page.getByRole("link", { name: "Users", exact: true }).click();
    const table = page.getByRole("table", { name: "Users", exact: true });
    await expect(table).toBeVisible();
    await expect(
      table
        .getByRole("row")
        .filter({ hasText: account.email })
        .getByRole("button", { name: "Change role" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 · 21 users")).toBeVisible();
    expect(searches.some((value) => value.includes("offset=20"))).toBe(true);
    await page.getByRole("combobox", { name: "Search by" }).click();
    await page.getByRole("option", { name: "Name", exact: true }).click();
    await page.getByLabel("Search users", { exact: true }).fill("Member 0");
    await page.getByRole("button", { name: "Search users", exact: true }).click();
    const row = table.getByRole("row").filter({ hasText: "member-0@example.test" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Change role" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Role", exact: true }).click();
    await page.getByRole("option", { name: "Admin", exact: true }).click();
    expect(changes).toHaveLength(0);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Unable to change this role");
    await expect(page.getByText("private diagnostic")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Admin");
    expect(changes).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await capture(page, { path: test.info().outputPath(`users-${width}.png`), fullPage: true });
  });
}

test(
  "Web member cannot mount the user list on direct navigation",
  { tag: "@web" },
  async ({ page }) => {
    await webShellFixture(page);
    await signedInAccount(page);
    let reads = 0;
    await page.route("**/api/auth/admin/list-users**", (route) => {
      reads++;
      return authResponse(route, { users: [], total: 0 });
    });
    await page.goto(`${web}/admin/users`);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("You do not have permission");
    expect(reads).toBe(0);
  },
);
