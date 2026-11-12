import {
  test,
  signedInAccount,
  accountAccessFixture,
  authResponse,
  webShellFixture,
  capture,
  web,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Web administrators can search users and retry a confirmed role change",
  { tag: "@web" },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
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
    const searches: URLSearchParams[] = [];
    const changes: unknown[] = [];
    let fail = true;
    await page.route("**/api/auth/admin/list-users**", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const query = new URL(route.request().url()).searchParams;
      searches.push(query);
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
    await page.getByRole("button", { name: "Account menu", exact: true }).press("Enter");
    await page.getByRole("menuitem", { name: "Admin console", exact: true }).press("Enter");
    await page.getByRole("link", { name: "Users", exact: true }).click();
    await expect(page).toHaveURL(web + "/admin/users");
    const table = page.getByRole("table", { name: "Users", exact: true });
    await expect(table).toBeVisible();
    await expect(
      table
        .getByRole("row")
        .filter({ hasText: account.email })
        .getByRole("button", { name: "Change role" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(
      table.getByRole("row").filter({ hasText: "member-19@example.test" }),
    ).toBeVisible();
    expect(searches.some((query) => query.get("offset") === "20")).toBe(true);
    await page.getByRole("combobox", { name: "Search by" }).click();
    await page.getByRole("option", { name: "Name", exact: true }).click();
    await page.getByLabel("Search users", { exact: true }).fill("Member 0");
    await page.getByRole("button", { name: "Search users", exact: true }).click();
    const row = table.getByRole("row").filter({ hasText: "member-0@example.test" });
    await expect(row).toBeVisible();
    expect(
      searches.some(
        (query) =>
          query.get("searchField") === "name" &&
          query.get("searchValue") === "Member 0" &&
          Number(query.get("offset") ?? 0) === 0,
      ),
    ).toBe(true);
    const previewButton = row.getByRole("button", { name: "View permissions" });
    await previewButton.press("Enter");
    const preview = page.getByRole("dialog", { name: "View permissions" });
    await expect(preview.getByText("View projects", { exact: true })).toBeVisible();
    await expect(preview.getByText("View the audit log", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();
    await expect(previewButton).toBeFocused();
    await row.getByRole("button", { name: "Change role" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Role", exact: true }).click();
    await page.getByRole("option", { name: "Admin", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Permissions to add" })).toBeVisible();
    await expect(dialog.getByText("View the audit log", { exact: true })).toBeVisible();
    expect(changes).toHaveLength(0);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(page.getByText("private diagnostic")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByRole("cell", { name: "Admin", exact: true })).toBeVisible();
    expect(changes).toEqual([
      expect.objectContaining({ userId: "member-0", role: "admin" }),
      expect.objectContaining({ userId: "member-0", role: "admin" }),
    ]);
    await capture(page, { path: test.info().outputPath("users-mobile.png"), fullPage: true });
  },
);

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
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("table", { name: "Users", exact: true })).toHaveCount(0);
    expect(reads).toBe(0);
  },
);
