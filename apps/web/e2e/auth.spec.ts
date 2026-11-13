import { test, web, authResponse } from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Web registration validates fields and sends the verification request",
  { tag: "@web" },
  async ({ page }) => {
    const submissions: Record<string, unknown>[] = [];
    await page.route("**/api/auth/sign-up/email", async (route) => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>);
      expect(route.request().headers()["accept-language"]).toBe("en");
      await authResponse(route, {
        user: {
          id: "browser-fixture",
          email: "test@example.com",
          name: "Browser Test",
          emailVerified: false,
        },
        token: null,
      });
    });
    await page.goto(`${web}/signup`);
    await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Browser Test");
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill("invalid-email");
    await page.getByLabel("Password", { exact: true }).fill("valid-password-123");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    expect(submissions).toHaveLength(0);
    expect(
      await page
        .getByRole("textbox", { name: "Email address", exact: true })
        .evaluate((element: HTMLInputElement) => element.validity.typeMismatch),
    ).toBe(true);
    await page
      .getByRole("textbox", { name: "Email address", exact: true })
      .fill("test@example.com");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      email: "test@example.com",
      name: "Browser Test",
      callbackURL: `${web}/verify-email?verified=1`,
    });
  },
);

test(
  "Web sign-in shows safe verification feedback and exposes password recovery",
  { tag: ["@web", "@smoke"] },
  async ({ page }) => {
    await page.route("**/api/auth/sign-in/email", (route) =>
      authResponse(
        route,
        { code: "EMAIL_NOT_VERIFIED", message: "Untranslated server diagnostic" },
        403,
      ),
    );
    await page.goto(`${web}/login`);
    await page
      .getByRole("textbox", { name: "Email address", exact: true })
      .fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("valid-password-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText("Untranslated server diagnostic");
    await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
    await expect(page).toHaveURL(`${web}/forgot-password`);
    await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
    await page.goto(`${web}/reset-password`);
    await expect(alert).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset password", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Send reset link", exact: true }).click();
    await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
  },
);

test(
  "Web confirms the account before completing Desktop browser sign-in",
  { tag: "@web" },
  async ({ page }) => {
    const oauthQuery = "client_id=raypx-desktop&nonce=fixture&sig=signed-fixture";
    const callback = `http://127.0.0.1:41337/desktop-login/callback?state=${"s".repeat(43)}&code=${"c".repeat(43)}`;
    let signedIn = false;
    const account = {
      id: "desktop-account",
      email: "desktop@example.test",
      name: "Desktop Account",
    };
    await page.route("**/api/auth/get-session", (route) =>
      authResponse(route, signedIn ? { user: account, session: { id: "web-session" } } : null),
    );
    await page.route("**/api/auth/sign-in/email", async (route) => {
      signedIn = true;
      await authResponse(route, { user: account });
    });
    await page.route("**/api/auth/desktop-login/inspect", (route) =>
      authResponse(
        route,
        signedIn
          ? {
              accountId: account.id,
              email: account.email,
              device: "Test computer",
              matchesProfile: true,
            }
          : { code: "UNAUTHORIZED" },
        signedIn ? 200 : 401,
      ),
    );
    await page.route("**/api/auth/desktop-login/decide", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        oauthQuery,
        accountId: account.id,
        approve: true,
      });
      await authResponse(route, { redirectUri: callback });
    });
    await page.route(callback, (route) => route.fulfill({ body: "Return to Raypx Desktop" }));
    await page.goto(`${web}/desktop-authorize?${new URLSearchParams({ oauth: oauthQuery })}`);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email address", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill("desktop-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Test computer")).toBeVisible();
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Authorize Desktop" }).click();
    await expect(page).toHaveURL(callback);
    await expect(page.getByText("Return to Raypx Desktop")).toBeVisible();
  },
);
