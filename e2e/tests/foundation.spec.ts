import { expect, test, type Page, type Route } from "@playwright/test";

const web = "http://127.0.0.1:4173";
const desktop = "http://127.0.0.1:4174";

async function authResponse(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": route.request().headers().origin ?? web,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type,Accept-Language",
    },
    body: status === 204 ? "" : JSON.stringify(body),
  });
}

// Browser acceptance isolates HTTP responses only. It never creates native IPC.
// Real registration, verification, reset and revocation run in API's PostgreSQL gate.
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/auth\//, async (route) => {
    if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
    if (new URL(route.request().url()).pathname.endsWith("/get-session"))
      return authResponse(route, null);
    return authResponse(
      route,
      { code: "TEST_UNEXPECTED_AUTH_REQUEST", message: "Unexpected request" },
      500,
    );
  });
});

async function preferencesPersist(page: Page, base: string) {
  await page.goto(`${base}/settings`);
  await expect(page.getByRole("heading", { name: "Make it yours" })).toBeVisible();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh");
  await expect(page.getByRole("heading", { name: "按你的习惯设置" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("combobox", { name: "语言", exact: true })).toHaveValue("zh");
  await expect(page.getByRole("radio", { name: "深色", exact: true })).toBeChecked();
  await page.screenshot({
    path: test
      .info()
      .outputPath(base === web ? "web-settings-dark-zh.png" : "desktop-settings-dark-zh.png"),
    fullPage: true,
  });
}

test("Web keeps account and local preferences accessible while signed out", async ({ page }) => {
  await page.goto(web);
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You’re not signed in" })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await preferencesPersist(page, web);
});

test("Web registration validates fields and sends the verification request", async ({ page }) => {
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
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill("test@example.com");
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
});

test("Web sign-in translates verification errors and exposes password recovery", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    authResponse(
      route,
      { code: "EMAIL_NOT_VERIFIED", message: "Untranslated server diagnostic" },
      403,
    ),
  );
  await page.goto(`${web}/login`);
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("valid-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Verify your email before signing in.");
  await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
  await page.goto(`${web}/reset-password`);
  await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeDisabled();
});

test("Web settings remain usable on a narrow screen without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${web}/settings`);
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
});

test("Desktop preview states local unavailability without a login wall", async ({ page }) => {
  await page.goto(desktop);
  await expect(page.getByRole("heading", { name: "Your local files", exact: true })).toBeVisible();
  await expect(
    page.getByText("Open the desktop app to use local tools.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose folder", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Start with a folder", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => "__electrobunWebviewId" in window)).toBe(false);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You’re not signed in" })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await preferencesPersist(page, desktop);
});
