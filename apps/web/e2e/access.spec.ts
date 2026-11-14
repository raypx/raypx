import { test, web, accountAccessFixture, authResponse } from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Web keeps public pages account-free and protects Agents and administration",
  { tag: ["@web", "@smoke"] },
  async ({ page }) => {
    const privateReads: string[] = [];
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    page.on("request", (request) => {
      if (
        /\/rpc\/(spaces|agents|conversations|tasks|approvals|devices|account|memory|jobs)\//.test(
          request.url(),
        )
      )
        privateReads.push(request.url());
    });
    await page.goto(web + "/");
    await expect(
      page.getByRole("heading", {
        name: "Agents that keep the conversation going.",
        exact: true,
      }),
    ).toBeVisible();
    for (const path of ["/settings", "/privacy"]) {
      await page.goto(web + path);
      await expect(page).toHaveURL(web + path);
    }
    for (const path of ["/agents", "/admin/settings"]) {
      await page.goto(web + path);
      await expect(page).toHaveURL(web + "/login?returnTo=" + encodeURIComponent(path));
      await expect(
        page.getByRole("textbox", { name: "Email address", exact: true }),
      ).toBeEditable();
    }
    expect(privateReads).toEqual([]);
  },
);

test(
  "Web homepage updates the Agent destination across session changes",
  { tag: "@web" },
  async ({ page }) => {
    let signedIn = true;
    const user = {
      id: "homepage-fixture",
      name: "Home User",
      email: "home@example.test",
      emailVerified: true,
    };
    const session = {
      id: "homepage-session",
      userId: user.id,
      token: "browser-fixture-only",
      createdAt: "2026-11-01T08:00:00Z",
      updatedAt: "2026-11-01T08:00:00Z",
      expiresAt: "2030-11-01T08:00:00Z",
    };
    await page.route("**/api/auth/get-session**", (route) =>
      authResponse(route, signedIn ? { user, session } : null),
    );
    await accountAccessFixture(page, user.id);
    await page.goto(web + "/");
    const primary = page
      .getByRole("main")
      .getByRole("link", { name: "Open Agents", exact: true })
      .first();
    await expect(primary).toHaveAttribute("href", "/agents");
    const otherTab = await page.context().newPage();
    await otherTab.goto(web + "/privacy");
    signedIn = false;
    await otherTab.evaluate(() =>
      localStorage.setItem(
        "better-auth.message",
        JSON.stringify({ event: "session", data: { trigger: "signout" }, timestamp: Date.now() }),
      ),
    );
    await expect(primary).toHaveAttribute("href", "/login?returnTo=%2Fagents");
    await otherTab.close();
  },
);
