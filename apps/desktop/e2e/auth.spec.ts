import { expect } from "@playwright/test";
import { authResponse, capture, desktop, test } from "@raypx/e2e/testing";

const authPages = [
  ["login", "/login?returnTo=%2Ftasks%3Fscope%3Dremote"],
  ["signup", "/signup"],
  ["forgot-password", "/forgot-password"],
  ["reset-password", "/reset-password?token=browser-fixture-only"],
  ["verify-email", "/verify-email"],
] as const;

for (const { width, height, locale, colorScheme } of [
  { width: 1280, height: 800, locale: "en", colorScheme: "light" },
  { width: 1280, height: 800, locale: "zh", colorScheme: "dark" },
  { width: 800, height: 520, locale: "en", colorScheme: "light" },
  { width: 800, height: 640, locale: "zh", colorScheme: "dark" },
] as const) {
  test(
    `Desktop authentication visual matrix ${width} ${locale} ${colorScheme}`,
    { tag: "@desktop" },
    async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.addInitScript((language) => {
        localStorage.setItem("raypx_locale", language);
      }, locale);
      for (const [name, path] of authPages) {
        await page.goto(desktop + path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true);
        for (const input of await page.locator("main input").all()) {
          const bounds = await input.evaluate((field) =>
            (field.closest('[data-slot="input-group"]') ?? field).getBoundingClientRect().toJSON(),
          );
          expect(bounds.width).toBeLessThanOrEqual(400);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
        }
        const email = page.locator('main input[type="email"]');
        if (await email.count()) await expect(email).toHaveAttribute("autocomplete", "email");
        const password = page.locator('main input[name="password"]');
        if (await password.count())
          await expect(password).toHaveAttribute(
            "autocomplete",
            name === "login" ? "current-password" : "new-password",
          );
        await capture(page, {
          path: test
            .info()
            .outputPath(`desktop-auth-${name}-${width}-${locale}-${colorScheme}.png`),
          animations: "disabled",
        });
        if (name === "signup" && height === 520) {
          await password.focus();
          await page.keyboard.press("Tab");
          await expect(
            page.getByRole("button", { name: "Show password", exact: true }),
          ).toBeFocused();
          await page.keyboard.press("Tab");
          const submit = page.getByRole("button", { name: "Create account", exact: true });
          await expect(submit).toBeFocused();
          await expect(submit).toBeInViewport();
          expect(await page.getByRole("main").evaluate((main) => main.scrollTop)).toBeGreaterThan(
            0,
          );
          await capture(page, {
            path: test.info().outputPath("desktop-auth-signup-800-short-keyboard.png"),
            animations: "disabled",
          });
        }
      }
    },
  );
}

test(
  "Desktop authentication retains entered values across language changes and returns to the workspace",
  { tag: "@desktop" },
  async ({ page }) => {
    await page.goto(desktop + "/login?returnTo=%2Ftasks%3Fscope%3Dremote");
    await page.getByLabel("Email address", { exact: true }).fill("desktop@example.test");
    await page.getByLabel("Password", { exact: true }).fill("unsubmitted-fixture-password");
    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
    await expect(page.getByLabel("邮箱地址", { exact: true })).toHaveValue("desktop@example.test");
    await expect(page.getByLabel("密码", { exact: true })).toHaveValue(
      "unsubmitted-fixture-password",
    );
    await page.getByRole("link", { name: "返回工作台", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/tasks?scope=remote");
  },
);

test(
  "Desktop authentication recovery states keep the email, cooldown and next action",
  { tag: "@desktop" },
  async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const { path, endpoint, action, message } of [
      {
        path: "forgot-password",
        endpoint: "request-password-reset",
        action: "Send reset link",
        message: "If this email has an account, a reset link is on its way.",
      },
      {
        path: "verify-email",
        endpoint: "send-verification-email",
        action: "Resend verification email",
        message: "Verification email sent. Check your inbox.",
      },
    ]) {
      let requests = 0;
      await page.route(`**/api/auth/${endpoint}`, (route) => {
        requests++;
        return authResponse(route, { status: true });
      });
      await page.goto(desktop + `/${path}?email=desktop%40example.test`);
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.getByRole("status")).toHaveText(message);
      await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
        "desktop@example.test",
      );
      const resend = page.getByRole("button", { name: /Resend in \d+s/ });
      await expect(resend).toBeDisabled();
      await page
        .locator("form")
        .evaluate((form) =>
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
      expect(requests).toBe(1);
      await capture(page, {
        path: test.info().outputPath(`desktop-auth-${path}-sent.png`),
        animations: "disabled",
      });
    }
    await page.goto(desktop + "/reset-password");
    await expect(
      page.getByRole("heading", { name: "Request a new link", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Send reset link", exact: true })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    await capture(page, {
      path: test.info().outputPath("desktop-auth-reset-expired.png"),
      animations: "disabled",
    });
    await page.goto(desktop + "/verify-email?verified=1");
    await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await capture(page, {
      path: test.info().outputPath("desktop-auth-email-verified.png"),
      animations: "disabled",
    });
    await page.route("**/api/auth/reset-password", (route) =>
      authResponse(route, { status: true }),
    );
    await page.goto(desktop + "/reset-password?token=browser-fixture-only");
    await page.getByLabel("New password", { exact: true }).fill("replacement-fixture-password");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Password updated", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
    await page.mouse.move(0, 0);
    await capture(page, {
      path: test.info().outputPath("desktop-auth-reset-complete.png"),
      animations: "disabled",
    });
  },
);
