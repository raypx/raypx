import { expect } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import { web } from "./helpers/surfaces.js";
import { authResponse } from "./helpers/account-fixture.js";

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
    await expect(page.getByRole("status")).toContainText(
      "Check your inbox for the verification link",
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      email: "test@example.com",
      name: "Browser Test",
      callbackURL: `${web}/verify-email?verified=1`,
    });
  },
);

test(
  "Web sign-in translates verification errors and exposes password recovery",
  { tag: "@web" },
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
    await expect(page.getByRole("alert")).toHaveText("Verify your email before signing in.");
    await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
    await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
    await page.goto(`${web}/reset-password`);
    await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeDisabled();
  },
);
