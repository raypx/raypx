import { expect, type Page } from "@playwright/test";
import {
  test,
  web,
  capture,
  authResponse,
  signedInAccount,
  accountAccessFixture,
  webShellFixture,
} from "@raypx/e2e/testing";

const configuration = {
  siteName: "Raypx",
  registrationEnabled: true,
  bootstrap: false,
  setupTokenRequired: false,
  mailConfigured: false,
};
const copy = {
  en: {
    setup: "Setup token",
    invitation: "Invitation link",
    admin: "This creates the deployment administrator account.",
    onboarding: "Set up your deployment",
    send: "Send test email",
    accepted: "The mail service accepted the test email. Check your inbox.",
    retry: "Try again",
    reminder: "Your email address is unverified. You can keep using your account or verify it now.",
    dismiss: "Dismiss",
    reset: "Reset link",
    closeReset: "Close reset link",
    open: "Open sign-ups",
    forgot: "Email recovery unavailable",
    unavailable: "Email verification unavailable",
  },
  zh: {
    setup: "设置令牌",
    invitation: "邀请链接",
    admin: "此操作将创建部署管理员账号。",
    onboarding: "设置你的部署",
    send: "发送测试邮件",
    accepted: "邮件服务已接受测试邮件，请检查收件箱。",
    retry: "重试",
    reminder: "你的邮箱尚未验证。你可以继续使用账号，也可以现在验证。",
    dismiss: "暂时关闭",
    reset: "重置链接",
    closeReset: "关闭重置链接",
    open: "开放注册",
    forgot: "暂时无法通过邮件找回密码",
    unavailable: "暂时无法验证邮箱",
  },
} as const;

async function publicFlags(page: Page, overrides: Partial<typeof configuration>) {
  await page.route("**/rpc/configuration/public", (route) =>
    authResponse(route, { json: { ...configuration, ...overrides } }),
  );
}
async function review(page: Page, name: string) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    }
  }
  const reveal = name.startsWith("email-test-")
    ? page.getByRole("region", { name: /^(?:Test delivery|测试发送)$/ })
    : undefined;
  await capture(page, { path: test.info().outputPath(`${name}.png`), fullPage: true }, reveal);
}
async function openPrivate(page: Page, url: string) {
  await page.goto(url);
  // Reload even for a same-path hash change, so each configured response is fresh.
  await page.reload();
  // The deliberately invalid SSR cookie yields the real unavailable gate. Recover
  // through its UI so browser fixtures still exercise fresh client permission reads.
  const retry = page.getByRole("button", { name: /^(?:Try again|重试)$/ });
  await expect(retry).toBeVisible();
  await retry.click();
}
async function admin(page: Page) {
  await webShellFixture(page);
  const account = await signedInAccount(page);
  await accountAccessFixture(page, account.id, "admin");
  await page.route("**/rpc/configuration/access", (route) =>
    authResponse(route, { json: { allowed: true } }),
  );
  await page.route("**/rpc/configuration/get", (route) =>
    authResponse(route, {
      json: {
        values: { siteName: "Raypx", registrationEnabled: false, cleanupEnabled: true },
        revision: 1,
        updatedAt: null,
        deployment: { jobsEnabled: false, mailConfigured: false },
      },
    }),
  );
  return account;
}

for (const locale of ["en", "zh"] as const) {
  test(`reviews account admission and no-mail recovery in ${locale}`, async ({ page }) => {
    await page.addInitScript((language) => localStorage.setItem("raypx_locale", language), locale);
    const t = copy[locale];
    await publicFlags(page, { bootstrap: true, setupTokenRequired: true });
    await page.goto(`${web}/signup`);
    await expect(page.getByText(t.admin, { exact: true })).toBeVisible();
    await expect(page.getByLabel(t.setup, { exact: true })).toHaveAttribute("type", "password");
    await review(page, `first-administrator-token-${locale}`);
    await publicFlags(page, { bootstrap: true });
    await page.reload();
    await expect(page.getByText(t.admin, { exact: true })).toBeVisible();
    await expect(page.getByLabel(t.setup, { exact: true })).toHaveCount(0);
    await review(page, `first-administrator-${locale}`);
    await publicFlags(page, { registrationEnabled: false });
    await page.reload();
    await expect(page.getByLabel(t.invitation, { exact: true })).toHaveAttribute(
      "type",
      "password",
    );
    await expect(page.getByText(t.admin, { exact: true })).toHaveCount(0);
    await review(page, `invitation-only-${locale}`);
    await page.goto(`${web}/forgot-password`);
    await expect(page.getByRole("heading", { name: t.forgot, exact: true })).toBeVisible();
    await review(page, `no-mail-recovery-${locale}`);
    await page.goto(`${web}/verify-email`);
    await expect(page.getByRole("heading", { name: t.unavailable, exact: true })).toBeVisible();
    await review(page, `no-mail-verification-${locale}`);
  });

  test(`reviews email setup, saved delivery results and invitation settings in ${locale}`, async ({
    page,
  }) => {
    await page.addInitScript((language) => localStorage.setItem("raypx_locale", language), locale);
    await admin(page);
    await publicFlags(page, {});
    let configured = false;
    let accepted = true;
    const snapshot = () => ({
      values: configured
        ? { from: "Raypx <mail@example.test>", defaultLocale: locale, enabled: true }
        : null,
      revision: configured ? 1 : 0,
      updatedAt: null,
    });
    await page.route("**/rpc/configuration/resend", (route) =>
      authResponse(route, { json: snapshot() }),
    );
    await page.route("**/rpc/configuration/testMail", (route) =>
      authResponse(route, { json: { sent: accepted } }),
    );
    await openPrivate(page, `${web}/admin/settings#setup`);
    const t = copy[locale];
    await expect(
      page.getByRole("heading", { level: 1, name: t.onboarding, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("button", { name: t.send, exact: true })).toBeDisabled();
    await review(page, `email-setup-${locale}`);
    configured = true;
    await openPrivate(page, `${web}/admin/settings#setup`);
    await page.getByRole("button", { name: t.send, exact: true }).click();
    await expect(page.getByText(t.accepted, { exact: true })).toBeVisible();
    await review(page, `email-test-accepted-${locale}`);
    accepted = false;
    await page.getByRole("button", { name: t.send, exact: true }).click();
    await expect(page.getByRole("button", { name: t.retry, exact: true })).toBeVisible();
    await review(page, `email-test-failed-${locale}`);
    await openPrivate(page, `${web}/admin/settings`);
    await expect(page.getByRole("switch", { name: t.open, exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await review(page, `invitation-settings-${locale}`);
  });

  test(`reviews the optional verification reminder and reset confirmation in ${locale}`, async ({
    page,
  }) => {
    await page.addInitScript((language) => localStorage.setItem("raypx_locale", language), locale);
    const account = await admin(page);
    const user = { ...account, emailVerified: false, emailVerificationSkipped: true };
    await page.route("**/api/auth/get-session**", (route) =>
      authResponse(route, {
        user,
        session: {
          id: "admission-review",
          userId: user.id,
          token: "browser-fixture-only",
          createdAt: "2026-11-14T00:00:00.000Z",
          updatedAt: "2026-11-14T00:00:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      }),
    );
    await publicFlags(page, { mailConfigured: true });
    await page.goto(`${web}/agents`);
    const t = copy[locale];
    await expect(page.getByText(t.reminder, { exact: true })).toBeVisible();
    await review(page, `verification-reminder-${locale}`);
    await page.getByRole("button", { name: t.dismiss, exact: true }).click();
    await expect(page.getByText(t.reminder, { exact: true })).toHaveCount(0);
    await publicFlags(page, {});
    await page.route("**/api/auth/admin/list-users**", (route) =>
      authResponse(route, {
        users: [
          {
            id: "review-member",
            name: "Space member",
            email: "member@example.test",
            emailVerified: false,
            role: "member",
            banned: false,
            banReason: null,
            banExpires: null,
            createdAt: "2026-11-14T00:00:00.000Z",
            updatedAt: "2026-11-14T00:00:00.000Z",
            image: null,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      }),
    );
    await openPrivate(page, `${web}/admin/users`);
    await page.getByRole("button", { name: t.reset, exact: true }).click();
    await expect(page.getByRole("dialog", { name: t.reset, exact: true })).toBeVisible();
    // Capture only the confirmation. Never issue or capture a recovery credential.
    await review(page, `admin-reset-confirmation-${locale}`);
    await page.getByRole("button", { name: t.closeReset, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
