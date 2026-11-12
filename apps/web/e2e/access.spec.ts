import {
  test,
  web,
  capture,
  accountAccessFixture,
  authResponse,
  connectedProject,
  selectOption,
  expectPrivatePages,
  expectGuestShell,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

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
    await page.goto(web + "/");
    await expect(
      page.getByRole("heading", { name: "Run locally. Review remotely.", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Workspace" })
        .getByRole("link", { name: "Projects", exact: true }),
    ).toHaveAttribute("href", "/projects");
    await expect(page.getByRole("banner").getByRole("link", { name: "Projects" })).toHaveCount(0);
    expect(privateReads).toEqual([]);
    await capture(page, {
      path: test.info().outputPath("web-landing-home.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await capture(page, {
      path: test.info().outputPath("web-landing-home-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const path of ["/projects", "/settings", "/tasks", "/approvals"]) {
      await page.goto(web + path);
      await expect(page).toHaveURL(web + path);
      await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toBeVisible();
      await expect(
        page.getByRole("complementary").getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
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
  "Web homepage updates session actions across tabs without private workspace reads",
  { tag: ["@web", "@smoke"] },
  async ({ page }) => {
    let signedIn = true;
    const privateReads: string[] = [];
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
    let resolveSession!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveSession = resolve;
    });
    await page.route("**/api/auth/get-session**", async (route) => {
      await ready;
      return authResponse(route, signedIn ? { user, session } : null);
    });
    await accountAccessFixture(page, user.id);
    page.on("request", (request) => {
      if (/\/rpc\/(tasks|approvals|devices|observed|relay|memory|jobs)\//.test(request.url()))
        privateReads.push(request.url());
    });
    await page.goto(web + "/");
    await expect(
      page.getByRole("heading", { name: "Run locally. Review remotely.", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
    const loading = page.getByRole("button", { name: "Loading…", exact: true });
    await expect(loading).toHaveCount(1);
    await expect(loading.first()).toBeDisabled();
    const header = page.getByRole("banner");
    const headerHeight = () => header.evaluate((element: HTMLElement) => element.offsetHeight);
    const loadingHeight = await headerHeight();
    resolveSession();
    await expect(page.getByRole("link", { name: "Projects", exact: true })).toHaveAttribute(
      "href",
      "/projects",
    );
    await expect(page.getByRole("banner").getByRole("link", { name: "Projects" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute(
      "href",
      "/tasks",
    );
    await expect(
      page.getByRole("link", { name: "Connect a computer", exact: true }),
    ).toHaveAttribute("href", "/settings");
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    await expect(header).toHaveJSProperty("offsetHeight", loadingHeight);
    const [appearance, language, account] = await Promise.all([
      header.getByRole("button", { name: /^Appearance:/ }).boundingBox(),
      header.getByRole("button", { name: "Language", exact: true }).boundingBox(),
      header.getByRole("button", { name: "Account menu", exact: true }).boundingBox(),
    ]);
    if (!appearance || !language || !account) throw new Error("Missing homepage header controls");
    const preferenceGap = language.x - (appearance.x + appearance.width);
    expect(account.x - (language.x + language.width)).toBeCloseTo(preferenceGap);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
    expect(privateReads).toEqual([]);

    const otherTab = await page.context().newPage();
    await otherTab.goto(web + "/privacy");
    async function broadcast(trigger: "signout" | "signin") {
      await otherTab.evaluate((sessionTrigger) => {
        localStorage.setItem(
          "better-auth.message",
          JSON.stringify({
            event: "session",
            data: { trigger: sessionTrigger },
            timestamp: Date.now(),
          }),
        );
      }, trigger);
    }
    signedIn = false;
    await broadcast("signout");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in to connect a computer", exact: true }),
    ).toHaveAttribute("href", "/login?returnTo=%2Fsettings");
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
    await expect(header).toHaveJSProperty("offsetHeight", loadingHeight);
    await page.setViewportSize({ width: 320, height: 844 });
    const narrowHeight = await headerHeight();
    signedIn = true;
    await broadcast("signin");
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    await expect(header).toHaveJSProperty("offsetHeight", narrowHeight);
    await expect(
      page.getByRole("link", { name: "Connect a computer", exact: true }),
    ).toHaveAttribute("href", "/settings");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(web + "/");
    expect(privateReads).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await otherTab.close();
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
    await page.route("**/api/auth/sign-in/email", async (route) => {
      signedIn = true;
      await accountAccessFixture(page, user.id);
      return authResponse(route, { user, token: "synthetic-browser-fixture" });
    });
    await page.route("**/rpc/configuration/public", (route) =>
      authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
    );
    await page.route("**/rpc/configuration/access", (route) =>
      authResponse(route, { json: { allowed: false } }),
    );
    await page.route("**/rpc/account/get", (route) => authResponse(route, { json: user }));
    const deviceId = crypto.randomUUID(),
      projectId = crypto.randomUUID();
    await connectedProject(page, deviceId, projectId);
    for (const path of ["tasks/list", "approvals/list"])
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
    await page.getByRole("button", { name: "Session options", exact: false }).click();
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
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/tasks" &&
        url.searchParams.get("from") === "guest" &&
        Boolean(url.searchParams.get("guestDraft")),
    );
    await expect(
      page.getByText(
        "Your draft is saved. Choose a project to keep editing; execution waits for Send.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Raypx", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
    await expect(
      page.getByRole("textbox", { name: "What should the agent do?", exact: true }),
    ).toHaveValue(content);
    await page.getByRole("button", { name: "Session options", exact: false }).click();
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
