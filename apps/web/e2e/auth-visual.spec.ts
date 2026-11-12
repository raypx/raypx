import { test, web, authResponse, capture, signedInAccount } from "@raypx/e2e/testing";
import { expect, type Page } from "@playwright/test";

async function enabledProviders(page: Page, providers: ("google" | "github")[] = []) {
  await page.route("**/api/auth/social-providers", (route) => authResponse(route, { providers }));
}

const modes = [
  { path: "login", action: "Sign in", password: "current-password" },
  { path: "signup", action: "Create account", password: "new-password" },
  { path: "forgot-password", action: "Send reset link", password: null },
  {
    path: "reset-password?token=browser-fixture",
    action: "Reset password",
    password: "new-password",
  },
  { path: "verify-email", action: "Resend verification email", password: null },
] as const;

test(
  "Web authentication exposes the required controls in each mode on a narrow screen",
  { tag: "@web" },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await enabledProviders(page);
    for (const mode of modes) {
      await test.step(mode.path.split("?")[0]!, async () => {
        await page.goto(`${web}/${mode.path}`);
        const main = page.getByRole("main");
        await expect(main.getByRole("button", { name: mode.action, exact: true })).toBeEnabled();
        if (mode.password)
          await expect(main.locator('input[name="password"]')).toHaveAttribute(
            "autocomplete",
            mode.password,
          );
        if (mode.action !== "Reset password")
          await expect(
            main.getByRole("textbox", { name: "Email address", exact: true }),
          ).toBeEditable();
        await capture(page, {
          path: test.info().outputPath(`${mode.path.split("?")[0]}-mobile.png`),
          fullPage: true,
        });
      });
    }
  },
);

for (const mail of [
  {
    path: "forgot-password",
    endpoint: "request-password-reset",
    action: "Send reset link",
  },
  {
    path: "verify-email",
    endpoint: "send-verification-email",
    action: "Resend verification email",
  },
] as const) {
  test(
    `Web ${mail.path} retains the email and prevents repeat sends during cooldown`,
    { tag: "@web" },
    async ({ page }) => {
      let requests = 0;
      await page.route(`**/api/auth/${mail.endpoint}`, (route) => {
        requests += 1;
        return authResponse(route, { status: true });
      });
      await page.goto(`${web}/${mail.path}?returnTo=%2Ftasks`);
      const email = page.getByRole("textbox", { name: "Email address", exact: true });
      await email.fill("browser@example.test");
      await page.getByRole("button", { name: mail.action, exact: true }).click();
      await expect(page.getByRole("status")).toBeVisible();
      await expect(email).toHaveValue("browser@example.test");
      await expect(page.getByRole("button", { name: /^Resend/ })).toBeDisabled();
      await email.press("Enter");
      expect(requests).toBe(1);
      await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
        "href",
        "/login?returnTo=%2Ftasks",
      );
      await capture(page, {
        path: test.info().outputPath(`${mail.path}-sent.png`),
        fullPage: true,
        animations: "disabled",
      });
    },
  );
}

test(
  "Web password reset and verified email replace forms with complete recovery states",
  { tag: ["@web", "@smoke"] },
  async ({ page }) => {
    const resets: Record<string, unknown>[] = [];
    await page.route("**/api/auth/reset-password", (route) => {
      resets.push(route.request().postDataJSON() as Record<string, unknown>);
      return authResponse(route, { status: true });
    });
    await page.goto(`${web}/reset-password?token=browser-fixture&returnTo=%2Ftasks`);
    await page.getByLabel("New password", { exact: true }).fill("browser-new-password");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    expect(resets).toEqual([{ token: "browser-fixture", newPassword: "browser-new-password" }]);
    await capture(page, {
      path: test.info().outputPath("reset-complete.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${web}/login?returnTo=%2Ftasks`);
    await page.goto(`${web}/verify-email?verified=1&returnTo=%2Ftasks`);
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Ftasks",
    );
    await capture(page, {
      path: test.info().outputPath("email-verified.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.goto(`${web}/reset-password?token=browser-fixture&error=TOKEN_EXPIRED`);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("link", { name: "Send reset link", exact: true })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    await expect(page.getByRole("button", { name: "Reset password", exact: true })).toHaveCount(0);
    await capture(page, {
      path: test.info().outputPath("reset-expired.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);

test(
  "Web authentication preserves inputs through language changes and only offers enabled OAuth",
  { tag: "@web" },
  async ({ page }) => {
    await enabledProviders(page, ["github"]);
    await page.goto(`${web}/login?returnTo=%2Ftasks`);
    const email = page.getByRole("textbox", { name: "Email address", exact: true });
    const password = page.getByLabel("Password", { exact: true });
    await email.fill("browser@example.test");
    await password.fill("browser-password");
    await expect(
      page.getByRole("button", { name: "Continue with GitHub", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
    await expect(page.getByLabel("邮箱地址", { exact: true })).toHaveValue("browser@example.test");
    await expect(page.getByLabel("密码", { exact: true })).toHaveValue("browser-password");
    await page.getByRole("button", { name: "显示密码", exact: true }).click();
    await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
    await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "password");
    await expect(page.getByRole("link", { name: "忘记密码？", exact: true })).toHaveAttribute(
      "href",
      "/forgot-password?returnTo=%2Ftasks",
    );
    await page.goto(`${web}/login?error=access_denied`);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeEditable();
    await capture(page, {
      path: test.info().outputPath("oauth-failed-zh.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);

test(
  "Web sign-in prevents repeat submission and retries session refresh without credentials",
  { tag: "@web" },
  async ({ page }) => {
    await enabledProviders(page);
    let signIns = 0;
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/sign-in/email", async (route) => {
      signIns += 1;
      await pending;
      await authResponse(route, {
        user: { id: "browser-fixture", email: "browser@example.test", name: "Browser" },
        token: "browser-fixture-only",
      });
    });
    await page.goto(`${web}/login?returnTo=%2Fprojects`);
    await page
      .getByRole("textbox", { name: "Email address", exact: true })
      .fill("browser@example.test");
    await page.getByLabel("Password", { exact: true }).fill("browser-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Working…", exact: true })).toBeDisabled();
    await page.locator("main form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    expect(signIns).toBe(1);
    await capture(page, {
      path: test.info().outputPath("login-submitting.png"),
      fullPage: true,
      animations: "disabled",
    });
    release();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
    await capture(page, {
      path: test.info().outputPath("login-refresh-failed.png"),
      fullPage: true,
      animations: "disabled",
    });
    await signedInAccount(page);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page).toHaveURL(`${web}/projects`);
    expect(signIns).toBe(1);
  },
);
