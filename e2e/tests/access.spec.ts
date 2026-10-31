import { expect, type Page } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import { web, desktop } from "./helpers/surfaces.js";
import { capture } from "./helpers/capture.js";
import { authResponse, signedInAccount } from "./helpers/account-fixture.js";
import { selectOption } from "./helpers/select.js";

async function expectPrivatePages(page: Page, surface: "Web" | "Desktop", reads: string[]) {
  const base = surface === "Web" ? web : desktop;
  for (const [feature, path] of [
    ["memory", surface === "Desktop" ? "/memory?scope=account" : "/memory"],
    ["cloud schedules", surface === "Desktop" ? "/automations?scope=cloud" : "/automations"],
  ] as const) {
    await test.step(`${feature}: no private reads and exact login return path`, async () => {
      await page.goto(base + path);
      const login = page.getByRole("link", { name: "Sign in", exact: true }).last();
      await expect(login).toBeVisible();
      expect(reads).toEqual([]);
      if (surface === "Desktop" && feature === "cloud schedules") {
        await expect(page.getByRole("tab", { name: "Cloud", exact: true })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await page.getByRole("tab", { name: "This computer", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "Keep things moving", exact: true }),
        ).toBeVisible();
        await page.getByRole("tab", { name: "Cloud", exact: true }).click();
      }
      await login.click();
      await expect(page).toHaveURL(/\/login\?returnTo=/);
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe(path);
      expect(reads).toEqual([]);
    });
  }
}

async function expectGuestShell(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("complementary")).toBeInViewport();
  await expect(page.getByRole("banner")).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
}

test(
  "Web lets guests browse without reading private data and protects administrator pages",
  { tag: ["@web", "@smoke"] },
  async ({ page }) => {
    const privateReads: string[] = [];
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    await page.route("**/rpc/configuration/public", (route) =>
      authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
    );
    page.on("request", (request) => {
      if (
        /\/rpc\/(tasks|approvals|devices|observed|account|relay|memory|jobs)\//.test(request.url())
      )
        privateReads.push(request.url());
    });
    for (const path of ["/", "/settings", "/tasks", "/approvals"]) {
      await page.goto(web + path);
      await expect(page).toHaveURL(web + path);
      await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
      if (path === "/") {
        await expectGuestShell(page);
        await capture(page, {
          path: test.info().outputPath("web-guest-home.png"),
          fullPage: true,
          animations: "disabled",
        });
      }
      if (path === "/tasks") {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ colorScheme: "dark" });
        await expectGuestShell(page);
        await capture(page, {
          path: test.info().outputPath("web-guest-tasks-mobile-dark.png"),
          fullPage: true,
          animations: "disabled",
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.emulateMedia({ colorScheme: "light" });
      }
    }
    expect(privateReads).toEqual([]);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapprovals/);
    await page.goto(web + "/admin/settings");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin%2Fsettings/);
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expectPrivatePages(page, "Web", privateReads);
  },
);

test(
  "Web resumes a guest draft after sign-in without sending a task",
  { tag: ["@web", "@smoke"] },
  async ({ page }) => {
    let signedIn = false,
      submitted = 0;
    const privateReads: string[] = [];
    const user = {
      id: "guest-resume-user",
      name: "Guest User",
      email: "guest@example.test",
      emailVerified: true,
    };
    const session = {
      id: "guest-resume-session",
      userId: user.id,
      token: "synthetic-browser-fixture",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    await page.route("**/api/auth/get-session**", (route) =>
      authResponse(route, signedIn ? { user, session } : null),
    );
    await page.route("**/api/auth/sign-in/email", (route) => {
      signedIn = true;
      return authResponse(route, { user, token: "synthetic-browser-fixture" });
    });
    await page.route("**/rpc/configuration/public", (route) =>
      authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
    );
    await page.route("**/rpc/configuration/access", (route) =>
      authResponse(route, { json: { allowed: false } }),
    );
    await page.route("**/rpc/account/get", (route) => authResponse(route, { json: user }));
    for (const path of ["tasks/list", "devices/list", "approvals/list"])
      await page.route("**/rpc/" + path, (route) => authResponse(route, { json: [] }));
    await page.route("**/rpc/observed/list", (route) =>
      authResponse(route, { json: { sessions: [], requests: [] } }),
    );
    await page.route("**/rpc/relay/ticket", (route) =>
      authResponse(route, { json: { token: "a".repeat(64) } }),
    );
    await page.routeWebSocket("**/relay**", (socket) =>
      socket.onMessage((raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === "auth")
          socket.send(JSON.stringify({ type: "ready", role: "viewer", protocolVersion: 4 }));
        if (frame.type === "request") submitted++;
      }),
    );
    page.on("request", (request) => {
      if (
        !signedIn &&
        /\/rpc\/(tasks|devices|approvals|observed|account|relay)\//.test(request.url())
      )
        privateReads.push(request.url());
    });
    await page.goto(web + "/tasks?from=guest");
    const content = "Review this guest draft 中😀 without executing it";
    await page
      .getByRole("textbox", { name: "What should the agent do?", exact: true })
      .fill(content);
    await page.getByRole("button", { name: "Task options", exact: false }).click();
    await selectOption(page, page.getByRole("combobox", { name: "Agent", exact: true }), "codex");
    await selectOption(
      page,
      page.getByRole("combobox", { name: "Execution", exact: true }),
      "plan",
    );
    await page.getByRole("button", { name: "Sign in to send", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    expect(page.url()).not.toContain(encodeURIComponent(content));
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(web + "/tasks?from=guest");
    await expect(
      page.getByRole("textbox", { name: "What should the agent do?", exact: true }),
    ).toHaveValue(content);
    await page.getByRole("button", { name: "Task options", exact: false }).click();
    await expect(page.getByRole("combobox", { name: "Agent", exact: true })).toContainText("Codex");
    await expect(page.getByRole("combobox", { name: "Execution", exact: true })).toContainText(
      "Analyze, then ask before implementing",
    );
    expect(privateReads).toEqual([]);
    expect(submitted).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectGuestShell(page);
    await capture(page, {
      path: test.info().outputPath("web-guest-resumed-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);

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
      await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    }
    expect(privateReads).toEqual([]);
    await page.goto(desktop + "/tasks");
    await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
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
    await expect(
      page.getByRole("tab", { name: "Connected computers", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.route("**/api/auth/sign-out", async (route) => {
      await page.route("**/api/auth/get-session**", (session) => authResponse(session, null));
      return authResponse(route, { success: true });
    });
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/");
    await expect(
      page.getByRole("heading", { name: "Your local files", exact: true }),
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
