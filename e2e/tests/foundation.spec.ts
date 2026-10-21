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

async function signedInDesktop(page: Page) {
  const user = {
    id: "desktop-fixture",
    name: "Desktop User",
    email: "desktop@example.test",
    emailVerified: true,
  };
  await page.route("**/api/auth/get-session**", (route) =>
    authResponse(route, {
      user,
      session: {
        id: "desktop-session",
        userId: user.id,
        token: "browser-fixture-only",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route("**/rpc/account/get", (route) =>
    authResponse(route, { json: { id: user.id, name: user.name, email: user.email } }),
  );
  await page.route("**/rpc/approvals/list", (route) => authResponse(route, { json: [] }));
  await page.route("**/rpc/devices/list", (route) => authResponse(route, { json: [] }));
  return user;
}

// Browser acceptance isolates HTTP responses only. It never creates native IPC.
// Real registration, verification, reset and revocation run in API's PostgreSQL gate.
test.beforeEach(async ({ page }) => {
  await page.route("**/rpc/account/get", async (route) => {
    if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
    return authResponse(
      route,
      {
        json: {
          defined: false,
          code: "UNAUTHORIZED",
          message: "Authentication required",
          data: { error: { code: "AUTH_REQUIRED" } },
        },
      },
      401,
    );
  });
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

test("Desktop preview states local unavailability after sign-in", async ({ page }) => {
  const user = await signedInDesktop(page);
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
  await page.getByRole("link", { name: "Automations", exact: true }).click();
  await expect(page).toHaveURL(`${desktop}/automations`);
  await expect(
    page.getByRole("heading", { name: "Keep things moving", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Open the desktop app to use local tools.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New automation", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: user.name, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await preferencesPersist(page, desktop);
});

test("Desktop redirects signed-out workspace routes to a standalone login page", async ({
  page,
}) => {
  for (const path of ["/", "/settings", "/tasks", "/terminal", "/account"]) {
    await page.goto(desktop + path);
    await expect(page).toHaveURL(desktop + "/login");
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  }
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(desktop + "/signup");
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeVisible();
  await page.goto(desktop + "/forgot-password?email=desktop%40example.test");
  await expect(page.getByRole("textbox", { name: "Email address", exact: true })).toHaveValue(
    "desktop@example.test",
  );
  await page.goto(desktop + "/reset-password?token=fixture-reset");
  await expect(page).toHaveURL(desktop + "/reset-password?token=fixture-reset");
  await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeEnabled();
  await page.goto(desktop + "/verify-email?verified=1");
  await expect(
    page.getByText("Your email is verified. You can sign in now.", { exact: true }),
  ).toBeVisible();
  await page.goto(desktop + "/login");
  await page.screenshot({
    path: test.info().outputPath("desktop-login.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("Desktop opens the workspace after login and returns to login after logout", async ({
  page,
}) => {
  await page.goto(desktop + "/tasks");
  await expect(page).toHaveURL(desktop + "/login");
  await page.route("**/api/auth/sign-in/email", async (route) => {
    const user = await signedInDesktop(page);
    return authResponse(route, { user, token: "browser-fixture-only" });
  });
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill("desktop@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(desktop + "/account");
  await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desktop User", exact: true })).toBeVisible();
  await page.route("**/api/auth/sign-out", async (route) => {
    await page.route("**/api/auth/get-session**", (session) => authResponse(session, null));
    return authResponse(route, { success: true });
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(desktop + "/login");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toHaveCount(0);
});

test("Desktop distinguishes an unavailable session check from being signed out", async ({
  page,
}) => {
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
  await expect(page).toHaveURL(desktop + "/login");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
});

for (const [surface, base] of [
  ["Web", web],
  ["Desktop", desktop],
] as const) {
  test(`${surface} opens the sidebar account menu with keyboard and keeps the popup inside the viewport`, async ({
    page,
  }) => {
    if (surface === "Web") await page.setViewportSize({ width: 390, height: 844 });
    else await signedInDesktop(page);
    await page.goto(`${base}/settings`);
    const trigger = page.getByRole("button", { name: "Account menu", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Account menu", exact: true });
    await expect(
      menu.getByRole("menuitem", { name: surface === "Web" ? "Sign in" : "Sign out", exact: true }),
    ).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({
      path: test.info().outputPath("account-menu.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    if (surface === "Web") {
      await page.getByRole("menuitem", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(`${base}/login`);
      await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    } else await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await page.goto(`${base}/settings`);
    await page.getByRole("radio", { name: "Dark", exact: true }).check();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh");
    await page.getByRole("button", { name: "账号菜单", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "设置", exact: true })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: surface === "Web" ? "登录" : "退出登录", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("account-menu-dark-zh.png"),
      fullPage: true,
      animations: "disabled",
    });
  });

  test(`${surface} shows the user avatar and allows retrying a failed sign-out from the menu`, async ({
    page,
  }) => {
    let signedIn = true;
    let attempts = 0;
    const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#333"/><circle cx="16" cy="12" r="5" fill="#fff"/><path d="M6 30a10 10 0 0 1 20 0" fill="#fff"/></svg>')}`;
    const user = {
      id: "menu-fixture",
      name: "Ada Lovelace",
      email: "ada@example.test",
      image,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await page.route("**/rpc/approvals/list", (route) => authResponse(route, { json: [] }));
    await page.route("**/rpc/devices/list", (route) => authResponse(route, { json: [] }));
    await page.route("**/api/auth/get-session**", (route) =>
      authResponse(
        route,
        signedIn
          ? {
              user,
              session: {
                id: "menu-session",
                userId: user.id,
                token: "browser-fixture-only",
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
              },
            }
          : null,
      ),
    );
    await page.route("**/api/auth/sign-out", async (route) => {
      attempts++;
      if (attempts === 1)
        return authResponse(
          route,
          { code: "TEST_UNAVAILABLE", message: "private diagnostic" },
          500,
        );
      signedIn = false;
      return authResponse(route, { success: true });
    });
    await page.goto(`${base}/settings`);
    const trigger = page.getByRole("button", { name: "Account menu", exact: true });
    await expect(trigger).toContainText(user.name);
    await expect(trigger.locator("img")).toHaveAttribute("src", image);
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Account menu", exact: true });
    await expect(menu.getByText(user.email, { exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("account-menu-signed-in.png"),
      fullPage: true,
      animations: "disabled",
    });
    await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(menu.getByRole("alert")).toHaveText(
      "Unable to connect. Check your connection and try again.",
    );
    await expect(menu.getByText("private diagnostic")).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(base + (surface === "Web" ? "/" : "/login"));
    await expect(
      page.getByRole("heading", {
        name: surface === "Web" ? "You’re not signed in" : "Welcome back",
        exact: true,
      }),
    ).toBeVisible();
    if (surface === "Web") await expect(trigger).toContainText("Sign in");
    else await expect(trigger).toHaveCount(0);
    expect(attempts).toBe(2);
  });
}
