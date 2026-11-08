import {
  test,
  desktop,
  capture,
  authResponse,
  signedInAccount,
  expectPrivatePages,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Desktop keeps local tools public and asks for login only for remote features",
  { tag: ["@desktop", "@smoke"] },
  async ({ page }) => {
    const privateReads: string[] = [];
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    page.on("request", (request) => {
      if (
        /\/rpc\/(tasks|devices|account|approvals|observed|relay|memory|jobs)\//.test(request.url())
      )
        privateReads.push(request.url());
    });
    for (const path of ["/", "/settings", "/tasks", "/terminal", "/automations", "/account"]) {
      await page.goto(desktop + path);
      await expect(page).toHaveURL(desktop + path);
      await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toBeVisible();
      await expect(
        page.getByRole("complementary").getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
    }
    expect(privateReads).toEqual([]);
    // Guests have no connected-computer shortcuts; remote views stay reachable by URL.
    await page.goto(desktop + "/tasks?scope=remote");
    await expect(
      page.getByRole("heading", { name: "Sign in for remote access", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Ftasks%3Fscope%3Dremote/);
    await page.getByRole("link", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?returnTo=/);
    await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeVisible();
    await page.goto(desktop + "/welcome");
    await expect(
      page.getByRole("heading", { name: "Start on this computer", exact: true }),
    ).toBeVisible();
    await capture(page, {
      path: test.info().outputPath("desktop-local-welcome.png"),
      fullPage: true,
      animations: "disabled",
    });
    await expectPrivatePages(page, "Desktop", privateReads);
  },
);

test(
  "Desktop returns to the requested remote page after login and keeps local tools after logout",
  { tag: "@desktop" },
  async ({ page }) => {
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    await page.goto(desktop + "/tasks?scope=remote");
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.route("**/api/auth/sign-in/email", async (route) => {
      const user = await signedInAccount(page);
      return authResponse(route, { user, token: "browser-fixture-only" });
    });
    await page
      .getByRole("textbox", { name: "Email address", exact: true })
      .fill("desktop@example.test");
    await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/tasks?scope=remote");
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await page.route("**/api/auth/sign-out", async (route) => {
      await page.route("**/api/auth/get-session**", (session) => authResponse(session, null));
      return authResponse(route, { success: true });
    });
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/");
    await expect(
      page.getByRole("heading", { name: "Start on this computer", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toBeVisible();
  },
);

test(
  "Desktop distinguishes an unavailable session check from being signed out",
  { tag: "@desktop" },
  async ({ page }) => {
    let available = false;
    await page.route("**/api/auth/get-session**", (route) =>
      available
        ? authResponse(route, null)
        : authResponse(
            route,
            { code: "FIXTURE_UNAVAILABLE", message: "private session diagnostic" },
            500,
          ),
    );
    await page.goto(desktop + "/settings");
    await expect(page.getByRole("alert")).toHaveText(
      "Unable to connect. Check your connection and try again.",
    );
    await expect(page).toHaveURL(desktop + "/settings");
    await expect(page.getByText("private session diagnostic")).toHaveCount(0);
    available = true;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/settings");
    await expect(
      page.getByRole("heading", { name: "Sign in for remote access", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
  },
);
