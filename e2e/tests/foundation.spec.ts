import { capture } from "./helpers/capture.js";
import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { authResponse, signedInDesktop, webShellFixture } from "./helpers/account-fixture.js";
import { selectOption } from "./helpers/select.js";
import { expectViewportShell } from "./helpers/layout.js";
import type {
  AgentTask,
  HumanRequest,
  TaskActivity,
  RelayClientFrame,
} from "@raypx/contracts/tasks";

const web = "http://127.0.0.1:4173";
const desktop = "http://127.0.0.1:4174";

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

for (const [surface, base] of [
  ["Web", web],
  ["Desktop", desktop],
] as const) {
  test(
    `${surface} shows conversation, Diff approvals and sends queued and immediate instructions`,
    { tag: [`@${surface.toLowerCase()}`, "@smoke"] },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInDesktop(page);
      const deviceId = crypto.randomUUID(),
        projectId = crypto.randomUUID(),
        now = new Date().toISOString();
      const task: AgentTask = {
        id: crypto.randomUUID(),
        deviceId,
        projectId,
        provider: "codex",
        mode: "run",
        prompt: "Improve task delivery reliability",
        summary: "",
        status: "waiting",
        parentTaskId: null,
        createdAt: now,
        updatedAt: now,
      };
      let approval: HumanRequest = {
        id: crypto.randomUUID(),
        taskId: task.id,
        kind: "permission",
        title: "Update task delivery",
        body: JSON.stringify({
          changes: [
            {
              path: "src/delivery.ts",
              kind: { type: "update" },
              diff: "@@ -12,2 +12,3 @@\n-send(input);\n+await persist(input);\n+await sendOnce(input);\n return receipt;",
            },
          ],
        }),
        questions: [],
        status: "pending",
        decision: null,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      const activity: TaskActivity[] = [
        {
          id: crypto.randomUUID(),
          taskId: task.id,
          order: 1,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          kind: "message",
          text: "## Delivery plan\n\nPersist each instruction before sending it.\n\n- Keep one active turn\n- Resume the same session\n\n```ts\nawait persist(input);\nawait sendOnce(input);\n```\n\n**Ready for your approval.**",
          status: "complete",
          truncated: false,
        },
        {
          id: crypto.randomUUID(),
          taskId: task.id,
          order: 2,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          kind: "tool",
          name: "Edit",
          status: "running",
        },
        {
          id: crypto.randomUUID(),
          taskId: task.id,
          order: 3,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          kind: "usage",
          inputTokens: 1200,
          outputTokens: 180,
          cachedInputTokens: 800,
          cacheWriteTokens: 0,
          durationMs: 3000,
        },
      ];
      const inputs: string[] = [];
      await page.route("**/rpc/tasks/list", (route) => {
        const before = route.request().postDataJSON()?.json?.before;
        return authResponse(route, { json: before ? [] : [task] });
      });
      await page.route("**/rpc/tasks/get", (route) =>
        authResponse(route, { json: { task, activity, events: [], requests: [approval] } }),
      );
      await page.route("**/rpc/devices/list", (route) =>
        authResponse(route, {
          json: [
            {
              id: deviceId,
              name: "Development Mac",
              platform: "darwin",
              appVersion: "0.1.0",
              epoch: 1,
              revoked: false,
              lastSeenAt: now,
              online: true,
              projects: [{ id: projectId, name: "Raypx", providers: ["codex"], dirty: false }],
              capabilities: [
                {
                  provider: "codex",
                  available: true,
                  version: "0.163.0",
                  reason: "ready",
                  inputModes: ["steer", "queue"],
                },
              ],
            },
          ],
        }),
      );
      await page.route("**/rpc/relay/ticket", (route) =>
        authResponse(route, {
          json: {
            token: "browser-fixture-token-000000000000000",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        }),
      );
      await page.routeWebSocket(/\/relay(?:\?|$)/, (socket) => {
        socket.onMessage((raw) => {
          const frame = JSON.parse(String(raw)) as RelayClientFrame;
          if (frame.type === "auth")
            socket.send(JSON.stringify({ type: "ready", protocolVersion: 2, role: "viewer" }));
          if (frame.type !== "request") return;
          let value: unknown;
          if (frame.request.method === "tasks.input") {
            const input = frame.request.input;
            inputs.push(input.mode);
            value = {
              id: input.id,
              taskId: task.id,
              kind: "input",
              mode: input.mode,
              text: input.prompt,
              status: "queued",
              order: activity.length + 1,
              revision: 1,
              createdAt: now,
              updatedAt: now,
            } satisfies TaskActivity;
            activity.push(value as TaskActivity);
          } else if (frame.request.method === "approvals.decide") {
            approval = { ...approval, status: "applied", decision: frame.request.input.decision };
            task.status = "running";
            value = approval;
          }
          socket.send(
            JSON.stringify({ type: "result", id: frame.id, result: { ok: true, value } }),
          );
        });
      });
      await page.goto(base + "/tasks");
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      const agentFilter = page
        .getByRole("region", { name: "Task history", exact: true })
        .getByRole("combobox", { name: "Agent", exact: true });
      await selectOption(page, agentFilter, "claude");
      await expect(
        page.getByRole("button", { name: /Improve task delivery reliability/ }),
      ).toHaveCount(0);
      await selectOption(page, agentFilter, "");
      await page.getByRole("button", { name: /Improve task delivery reliability/ }).click();
      await expect(
        page.getByRole("cell", { name: "await persist(input);", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Delivery plan", exact: true })).toBeVisible();
      const activityToggle = page.getByRole("button", { name: "Activity", exact: true });
      await activityToggle.click();
      await expect(activityToggle).toHaveAttribute("aria-expanded", "true");
      await activityToggle.press("Space");
      await expect(activityToggle).toHaveAttribute("aria-expanded", "false");
      const composer = page.getByRole("textbox", { name: "Add an instruction", exact: true });
      await composer.fill("Validate the queue after this turn.");
      await expect(page.getByRole("button", { name: "Send now", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Queue next turn", exact: true }).click();
      await expect(composer).toHaveValue("");
      await page.getByRole("button", { name: "Allow once", exact: true }).click();
      await composer.fill("Also handle a lost receipt.");
      await page.getByRole("button", { name: "Send now", exact: true }).click();
      await expect(composer).toHaveValue("");
      expect(inputs).toEqual(["queue", "steer"]);
      await expectViewportShell(page);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-conversation.png`),
        fullPage: true,
      });
      // The native Desktop shell has an 800px minimum window width.
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      await expectViewportShell(page);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-conversation-mobile.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.getByRole("main").evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Make it yours", exact: true })).toBeVisible();
      await expect
        .poll(() => page.getByRole("main").evaluate((element) => element.scrollTop))
        .toBe(0);
      await page.goBack();
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      await expect(page.getByRole("button", { name: "New task", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "New task", exact: true }).click();
      const createForm = page
        .getByRole("textbox", { name: "What should the agent do?", exact: true })
        .locator("xpath=ancestor::form[1]");
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Computer", exact: true }),
        deviceId,
      );
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Project", exact: true }),
        projectId,
      );
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Agent", exact: true }),
        "codex",
      );
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Execution", exact: true }),
        "plan",
      );
      await expect(
        createForm.getByRole("combobox", { name: "Project", exact: true }),
      ).toContainText("Raypx");
      await expect(
        createForm.getByRole("combobox", { name: "Execution", exact: true }),
      ).toContainText("Analyze, then ask before implementing");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (surface === "Web") {
        await page.goto(base + "/settings");
        await page.getByRole("radio", { name: "Dark", exact: true }).check();
        await page.getByRole("combobox", { name: "Language", exact: true }).click();
        await page.getByRole("option", { name: "简体中文", exact: true }).click();
        await page.goto(base + "/tasks");
        await page.getByRole("button", { name: /Improve task delivery reliability/ }).click();
        await expect(page.getByRole("heading", { name: "会话", exact: true })).toBeVisible();
        await expectViewportShell(page);
        await capture(page, {
          path: test.info().outputPath("web-conversation-dark-zh.png"),
          fullPage: true,
        });
        await page
          .getByRole("main")
          .evaluate((element) => element.scrollTo(0, element.scrollHeight));
        await capture(page, {
          path: test.info().outputPath("web-conversation-dark-zh-bottom.png"),
          fullPage: true,
        });
      }
    },
  );
}

// Browser acceptance isolates HTTP responses only. It never creates native IPC.
// Real registration, verification, reset and revocation run in API's PostgreSQL gate.
test.beforeEach(async ({ page }) => {
  await page.route("**/rpc/configuration/public", (route) =>
    authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
  );
  await page.route("**/rpc/configuration/access", (route) =>
    authResponse(route, { json: { allowed: false } }),
  );
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
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "按你的习惯设置" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("combobox", { name: "语言", exact: true })).toContainText("简体中文");
  await expect(page.getByRole("radio", { name: "深色", exact: true })).toBeChecked();
  await capture(page, {
    path: test
      .info()
      .outputPath(base === web ? "web-settings-dark-zh.png" : "desktop-settings-dark-zh.png"),
    fullPage: true,
  });
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
      if (/\/rpc\/(tasks|approvals|devices|observed|account|relay)\//.test(request.url()))
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
          socket.send(JSON.stringify({ type: "ready", role: "viewer", protocolVersion: 3 }));
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
  "Web preserves local appearance and language preferences with an account fixture",
  { tag: "@web" },
  async ({ page }) => {
    await webShellFixture(page);
    await signedInDesktop(page);
    await preferencesPersist(page, web);
  },
);

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

test(
  "Web settings remain usable on a narrow screen without horizontal overflow",
  { tag: "@web" },
  async ({ page }) => {
    await webShellFixture(page);
    await signedInDesktop(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${web}/settings`);
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "Light", exact: true }).check();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("link", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  },
);

test(
  "Desktop preview states local unavailability after sign-in",
  { tag: "@desktop" },
  async ({ page }) => {
    const user = await signedInDesktop(page);
    await page.goto(desktop);
    await expect(
      page.getByRole("heading", { name: "Your local files", exact: true }),
    ).toBeVisible();
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
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: user.name, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await preferencesPersist(page, desktop);
  },
);

test(
  "Desktop keeps local tools public and asks for login only for remote features",
  { tag: ["@desktop", "@smoke"] },
  async ({ page }) => {
    const privateReads: string[] = [];
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    page.on("request", (request) => {
      if (/\/rpc\/(tasks|devices|account|approvals|observed|relay)\//.test(request.url()))
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
      const user = await signedInDesktop(page);
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

test(
  "Desktop defaults to local tasks and opens remote tasks through an accessible scope switch",
  { tag: "@desktop" },
  async ({ page }) => {
    await signedInDesktop(page);
    let remoteReads = 0;
    await page.route("**/rpc/tasks/list", async (route) => {
      remoteReads++;
      await authResponse(route, { json: [] });
    });
    await page.goto(desktop + "/tasks");
    const local = page.getByRole("tab", { name: "This computer", exact: true });
    await expect(local).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("Open the desktop app to use local tools.", { exact: true }),
    ).toBeVisible();
    expect(remoteReads).toBe(0);
    await capture(page, {
      path: test.info().outputPath("local-tasks-preview.png"),
      fullPage: true,
    });
    await local.focus();
    await page.keyboard.press("ArrowRight");
    const remote = page.getByRole("tab", { name: "Connected computers", exact: true });
    await expect(remote).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(remote).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "No agent tasks yet", exact: true }),
    ).toBeVisible();
    expect(remoteReads).toBeGreaterThan(0);
    await page.goto(desktop + "/settings");
    await page.getByRole("radio", { name: "Dark", exact: true }).check();
    await page.getByRole("combobox", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "简体中文", exact: true }).click();
    await page.goto(desktop + "/tasks");
    await expect(page.getByRole("tab", { name: "此电脑", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await capture(page, {
      path: test.info().outputPath("local-tasks-preview-dark-zh.png"),
      fullPage: true,
    });
  },
);

test(
  "Desktop task pagination keeps short pages reachable in both directions",
  { tag: "@desktop" },
  async ({ page }) => {
    await signedInDesktop(page);
    const tasks = Array.from({ length: 3 }, (_, index) => ({
      id: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      provider: "codex",
      mode: "run",
      prompt: `Review local changes ${index + 1}`,
      summary: `Result ${index + 1}`,
      status: "succeeded",
      parentTaskId: null,
      createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
      updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
    }));
    await page.route("**/rpc/tasks/list", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const { json: input } = route.request().postDataJSON() as { json: { before?: string } };
      const visible = tasks.filter(
        (task) => !input.before || `${task.createdAt}:${task.id}` < input.before,
      );
      return authResponse(route, { json: visible.slice(0, 1) });
    });
    await page.route("**/rpc/tasks/get", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const { json: input } = route.request().postDataJSON() as { json: { id: string } };
      return authResponse(route, {
        json: { task: tasks.find((task) => task.id === input.id), events: [], requests: [] },
      });
    });
    await page.goto(desktop + "/tasks");
    await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
    const older = page.getByRole("button", { name: "Older tasks", exact: true });
    const newer = page.getByRole("button", { name: "Newer tasks", exact: true });
    await expect(page.getByRole("button", { name: /Review local changes 1/ })).toBeVisible();
    await expect(newer).toBeDisabled();
    await older.click();
    await expect(page.getByRole("button", { name: /Review local changes 2/ })).toBeVisible();
    await older.click();
    await page.getByRole("button", { name: /Review local changes 3/ }).click();
    await expect(page.getByText("Result 3", { exact: true })).toBeVisible();
    await expect(older).toBeDisabled();
    await capture(page, { path: test.info().outputPath("task-pagination.png"), fullPage: true });
    await newer.click();
    await expect(page.getByRole("button", { name: /Review local changes 2/ })).toBeVisible();
    await newer.click();
    await expect(page.getByRole("button", { name: /Review local changes 1/ })).toBeVisible();
    await expect(newer).toBeDisabled();
  },
);

for (const [surface, base] of [
  ["Web", web],
  ["Desktop", desktop],
] as const) {
  test(
    `${surface} virtual task list supports scrolling, keyboard access and page reset`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInDesktop(page);
      const tasks = Array.from({ length: 101 }, (_, index) => ({
        id: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: `Virtual task ${index + 1}: ${index % 2 ? "Check the result" : "检查项目的构建结果和任务执行状态。".repeat(12)}`,
        summary: `Virtual result ${index + 1}`,
        status: "succeeded",
        parentTaskId: null,
        createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
        updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
      }));
      await page.route("**/rpc/tasks/list", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const { json: input } = route.request().postDataJSON() as {
          json: { before?: string; limit: number };
        };
        return authResponse(route, {
          json: tasks
            .filter((task) => !input.before || `${task.createdAt}:${task.id}` < input.before)
            .slice(0, input.limit),
        });
      });
      await page.route("**/rpc/tasks/get", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const { json: input } = route.request().postDataJSON() as { json: { id: string } };
        return authResponse(route, {
          json: { task: tasks.find((task) => task.id === input.id), events: [], requests: [] },
        });
      });
      await page.goto(base + "/tasks");
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      const viewport = page.locator("[data-task-list]");
      const rows = viewport.getByRole("listitem");
      const first = viewport.getByRole("button", { name: /^Virtual task 1:/ });
      const last = viewport.getByRole("button", { name: /^Virtual task 100:/ });
      await expect(first).toBeVisible();
      await expect.poll(() => rows.count()).toBeLessThan(30);
      await expect(last).toHaveCount(0);
      await viewport.scrollIntoViewIfNeeded();
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(last).toBeInViewport();
      await last.click();
      await expect(page.getByText("Virtual result 100", { exact: true })).toBeVisible();
      await expect(last).toHaveAttribute("aria-pressed", "true");
      await last.press("Home");
      await expect(first).toBeFocused();
      await expect(first).toBeInViewport();
      await first.press("End");
      await expect(last).toBeFocused();
      await expect(last).toBeInViewport();
      await last.press("ArrowUp");
      const previous = viewport.getByRole("button", { name: /^Virtual task 99:/ });
      await expect(previous).toBeFocused();
      await expect(previous).toBeInViewport();
      // A pointer scroll must not unmount the row that still owns keyboard focus.
      await viewport.evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect(first).toBeInViewport();
      await expect(previous).toBeFocused();
      await expect.poll(() => rows.count()).toBeLessThan(30);
      await page.getByRole("button", { name: "Older tasks", exact: true }).click();
      await expect(viewport.getByRole("button", { name: /^Virtual task 101:/ })).toBeInViewport();
      await expect(page.getByRole("button", { name: "Older tasks", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Newer tasks", exact: true }).click();
      await expect(first).toBeInViewport();
      if (surface === "Web") await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() =>
          rows.evaluateAll((elements) =>
            elements.every((element, index) => {
              const previousRow = elements[index - 1];
              return (
                !previousRow ||
                Number(element.getAttribute("data-index")) !==
                  Number(previousRow.getAttribute("data-index")) + 1 ||
                element.getBoundingClientRect().top >=
                  previousRow.getBoundingClientRect().bottom - 1
              );
            }),
          ),
        )
        .toBe(true);
      await capture(page, {
        path: test.info().outputPath("virtual-task-list.png"),
        fullPage: true,
      });
    },
  );
}

for (const [surface, base] of [
  ["Web", web],
  ["Desktop", desktop],
] as const) {
  test(
    `${surface} groups sidebar menus and keeps collapsed navigation accessible`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      const user = await signedInDesktop(page);
      await page.route("**/rpc/approvals/list", (route) =>
        authResponse(route, {
          json: [
            {
              id: crypto.randomUUID(),
              taskId: crypto.randomUUID(),
              kind: "permission",
              title: "Check sidebar badge",
              body: "",
              questions: [],
              status: "pending",
              decision: null,
              expiresAt: new Date(Date.now() + 600000).toISOString(),
            } satisfies HumanRequest,
          ],
        }),
      );
      await page.goto(`${base}/settings`);
      const sidebar = page.getByRole("complementary");
      const workspace = sidebar.getByRole("group", { name: "Workspace", exact: true });
      await expect(workspace.getByRole("link", { name: "Tasks", exact: true })).toBeVisible();
      const waiting = workspace.getByRole("link", { name: /^Waiting/ });
      await expect(waiting).toContainText("1");
      if (surface === "Desktop") {
        const local = sidebar.getByRole("group", { name: "Local tools", exact: true });
        await expect(local.getByRole("link", { name: "Files", exact: true })).toBeVisible();
        await expect(local.getByRole("link", { name: "Automations", exact: true })).toBeVisible();
      }
      await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
      const expanded = (await sidebar.boundingBox())!;
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
      await expect(expand).toHaveAttribute("aria-expanded", "false");
      expect((await sidebar.boundingBox())!.width).toBe(64);
      expect(expanded.width).toBeGreaterThan(190);
      await expect(waiting.getByText("1", { exact: true })).toBeInViewport();
      const tasks = workspace.getByRole("link", { name: "Tasks", exact: true });
      await tasks.focus();
      // Tooltips follow visible keyboard focus rather than focus moved by a pointer action.
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(tasks).toBeFocused();
      // Base UI tooltips are visual labels; the link itself retains its accessible name.
      const hint = page.locator('[data-slot="tooltip-content"]').filter({ hasText: /^Tasks$/ });
      await expect(hint).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(hint).not.toBeVisible();
      await page.reload();
      await expect(expand).toHaveAttribute("aria-expanded", "false");
      expect((await sidebar.boundingBox())!.width).toBe(64);
      await page.setViewportSize({ width: 760, height: 900 });
      await tasks.hover();
      await expect(hint).toBeVisible();
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1280, height: 900 });
      const account = sidebar.getByRole("button", { name: "Account menu", exact: true });
      await expect(account.getByText(user.email, { exact: true })).toBeHidden();
      await account.click();
      const menu = page.getByRole("menu", { name: "Account menu", exact: true });
      await expect(menu.getByRole("menuitem", { name: "Settings", exact: true })).toBeVisible();
      const menuBox = (await menu.boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await capture(page, {
        path: test.info().outputPath("sidebar-collapsed-menu.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(account).toBeFocused();
      await expand.click();
      await expect(
        page.getByRole("button", { name: "Collapse sidebar", exact: true }),
      ).toHaveAttribute("aria-expanded", "true");
      expect((await sidebar.boundingBox())!.width).toBe(expanded.width);
      await capture(page, {
        path: test.info().outputPath("sidebar-expanded.png"),
        fullPage: true,
        animations: "disabled",
      });
    },
  );

  test(
    `${surface} opens the sidebar account menu with keyboard and keeps the popup inside the viewport`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await page.setViewportSize({ width: 390, height: 844 });
      if (surface === "Web") await webShellFixture(page);
      await signedInDesktop(page);
      await page.goto(`${base}/settings`);
      const trigger = page.getByRole("button", { name: "Account menu", exact: true });
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeEnabled();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu", { name: "Account menu", exact: true });
      await expect(menu.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
      const bounds = await menu.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await capture(page, {
        path: test.info().outputPath("account-menu.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
      await page.goto(`${base}/settings`);
      await page.getByRole("radio", { name: "Dark", exact: true }).check();
      await page.getByRole("combobox", { name: "Language", exact: true }).click();
      await page.getByRole("option", { name: "简体中文", exact: true }).click();
      await page.getByRole("button", { name: "账号菜单", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "设置", exact: true })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "退出登录", exact: true })).toBeVisible();
      await capture(page, {
        path: test.info().outputPath("account-menu-dark-zh.png"),
        fullPage: true,
        animations: "disabled",
      });
    },
  );

  test(
    `${surface} shows the user avatar and allows retrying a failed sign-out from the menu`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
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
      await page.route("**/rpc/account/get", (route) =>
        signedIn
          ? authResponse(route, { json: { id: user.id, name: user.name, email: user.email } })
          : authResponse(
              route,
              {
                json: { defined: false, code: "UNAUTHORIZED", message: "Authentication required" },
              },
              401,
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
        await page.context().clearCookies();
        return authResponse(route, { success: true });
      });
      await page.goto(`${base}/settings`);
      const trigger = page.getByRole("button", { name: "Account menu", exact: true });
      await expect(trigger).toContainText(user.name);
      await expect(trigger.locator("img")).toHaveAttribute("src", image);
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Account menu", exact: true });
      await expect(menu.getByText(user.email, { exact: true })).toBeVisible();
      await capture(page, {
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
      await expect(page).toHaveURL(base + "/");
      await expect(
        page.getByRole("heading", {
          name: surface === "Web" ? "Remote tasks and approvals" : "Your local files",
          exact: true,
        }),
      ).toBeVisible();
      if (surface === "Desktop") await expect(trigger).toBeVisible();
      expect(attempts).toBe(2);
    },
  );
}

for (const [surface, base] of [
  ["Web", web],
  ["Desktop", desktop],
] as const) {
  test(
    `${surface} analytics requires opt-in, separates categories and redacts actual SDK requests`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      await page.addInitScript(() => {
        // Exercise human-browser collection: PostHog also filters HeadlessChrome UA brands.
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "userAgentData", {
          get: () => ({
            brands: [{ brand: "Chromium", version: "156" }],
            mobile: false,
            platform: "Windows",
          }),
        });
      });
      const user = await signedInDesktop(page);

      const events: { event: string; properties: Record<string, unknown> }[] = [];
      await page.route("https://analytics.example.test/**", async (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        expect(route.request().headers().referer).toBeUndefined();
        const body = route.request().postDataBuffer();
        if (body) {
          const text = (body[0] === 31 && body[1] === 139 ? gunzipSync(body) : body).toString(
            "utf8",
          );
          const parsed = JSON.parse(text);
          events.push(...(Array.isArray(parsed) ? parsed : (parsed.batch ?? [parsed])));
        }
        return authResponse(route, {});
      });
      await page.goto(`${base}/settings?token=secret-reset-token`);
      const usage = page.getByRole("switch", { name: "Usage statistics", exact: true }),
        errors = page.getByRole("switch", { name: "Error reports", exact: true });
      await expect(usage).toBeEnabled();
      await expect(usage).not.toBeChecked();
      await expect(errors).not.toBeChecked();
      expect(events).toHaveLength(0);
      await usage.check();
      await expect.poll(() => events.some((event) => event.event === "page_viewed")).toBe(true);
      await expect
        .poll(() =>
          events.some(
            (event) => event.event === "$identify" && event.properties.distinct_id === user.id,
          ),
        )
        .toBe(true);
      await errors.check();
      const trigger = async () =>
        page.evaluate(() => {
          const error = new Error("private-prompt /Users/private key=secret-reset-token");
          error.stack = `Error: private-prompt\n at work (${location.origin}/assets/app-fixture.js:7:9)\n at file:///Users/private/a.js:1:2`;
          window.dispatchEvent(new ErrorEvent("error", { error, cancelable: true }));
        });
      await trigger();
      await expect
        .poll(() => events.filter((event) => event.event === "$exception").length)
        .toBe(1);
      expect(JSON.stringify(events)).not.toMatch(
        /private-prompt|secret-reset-token|\/Users\/private|desktop@example/,
      );
      await usage.uncheck();
      await expect(usage).not.toBeChecked();
      await trigger();
      await expect
        .poll(() => events.filter((event) => event.event === "$exception").length)
        .toBe(2);
      expect(
        events.filter((event) => event.event === "$exception").at(-1)!.properties.distinct_id,
      ).not.toBe(user.id);
      await page.reload();
      await expect(usage).not.toBeChecked();
      await expect(errors).toBeChecked();
      await errors.uncheck();
      const count = events.length;
      await trigger();
      await page.waitForTimeout(150);
      expect(events).toHaveLength(count);
      // A fresh SDK must honor a new opt-in even after its previous instance persisted opt-out.
      await page.reload();
      await expect(usage).not.toBeChecked();
      await expect(errors).not.toBeChecked();
      await errors.check();
      await trigger();
      await expect
        .poll(() => events.filter((event) => event.event === "$exception").length)
        .toBe(3);
      await errors.uncheck();
      if (surface === "Web") await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, {
        path: test.info().outputPath("analytics-settings.png"),
        fullPage: true,
      });
    },
  );
}

for (const [surface, base] of [
  ["Web", web],
  ["Desktop", desktop],
] as const) {
  test(
    `${surface} restores device-only task drafts and filters the real page overview`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInDesktop(page);
      const deviceId = crypto.randomUUID(),
        projectId = crypto.randomUUID();
      const tasks: AgentTask[] = (["waiting", "running", "succeeded"] as const).map(
        (status, index) => ({
          id: crypto.randomUUID(),
          deviceId,
          projectId,
          provider: "codex",
          mode: "run",
          prompt: [
            "Approve the migration",
            "Validate reconnect behavior",
            "Review completed changes",
          ][index]!,
          summary: status === "succeeded" ? "All changes validated." : "",
          status,
          parentTaskId: null,
          createdAt: new Date(Date.now() - index * 1000).toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      await page.route("**/rpc/tasks/list", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const { json } = route.request().postDataJSON() as { json: { before?: string } };
        return authResponse(route, { json: json.before ? [] : tasks });
      });
      await page.route("**/rpc/tasks/get", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const { json } = route.request().postDataJSON() as { json: { id: string } };
        return authResponse(route, {
          json: { task: tasks.find((task) => task.id === json.id), events: [], requests: [] },
        });
      });
      await page.route("**/rpc/devices/list", (route) =>
        authResponse(route, {
          json: [
            {
              id: deviceId,
              name: "Development Mac",
              online: true,
              revoked: false,
              platform: "darwin",
              appVersion: "0.1.0",
              epoch: 1,
              lastSeenAt: null,
              projects: [{ id: projectId, name: "Raypx", providers: ["codex"], dirty: false }],
              capabilities: [
                {
                  provider: "codex",
                  available: true,
                  version: "0.163.0",
                  reason: "ready",
                  inputModes: ["queue", "steer"],
                },
              ],
            },
          ],
        }),
      );
      await page.goto(base + "/tasks");
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      const overview = page.getByRole("group", { name: "Tasks on this page", exact: true });
      await expect(overview.getByRole("button", { name: /^Needs you/ })).toContainText("1");
      await overview.getByRole("button", { name: /^In progress/ }).click();
      const list = page.getByRole("list", { name: "Agent tasks", exact: true });
      await expect(list.getByRole("button", { name: /Validate reconnect behavior/ })).toBeVisible();
      await expect(list.getByRole("button", { name: /Approve the migration/ })).toHaveCount(0);
      await overview.getByRole("button", { name: /^All/ }).click();
      await page.getByRole("button", { name: "New task", exact: true }).click();
      const form = page.getByRole("form", { name: "New task", exact: true });
      const editor = form.getByRole("textbox", { name: "What should the agent do?", exact: true });
      await editor.fill("Investigate wake and reconnect behavior");
      await selectOption(
        page,
        form.getByRole("combobox", { name: "Computer", exact: true }),
        deviceId,
      );
      await selectOption(
        page,
        form.getByRole("combobox", { name: "Project", exact: true }),
        projectId,
      );
      await selectOption(page, form.getByRole("combobox", { name: "Agent", exact: true }), "codex");
      await form.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(form.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
      await page.reload();
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      const drafts = page.getByRole("region", { name: "Drafts", exact: true });
      await drafts.getByRole("button", { name: "Drafts", exact: true }).click();
      await drafts
        .getByRole("button", { name: /^Investigate wake and reconnect behavior/ })
        .click();
      await expect(editor).toHaveValue("Investigate wake and reconnect behavior");
      await expect(form.getByRole("combobox", { name: "Project", exact: true })).toContainText(
        "Raypx",
      );
      await form.getByRole("button", { name: "New draft", exact: true }).click();
      await expect(editor).toHaveValue("");
      await form.getByRole("button", { name: /^Task options/ }).click();
      await list.getByRole("button", { name: /Approve the migration/ }).click();
      await page.getByRole("main").evaluate((element) => element.scrollTo(0, 0));
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
      ).toBe(true);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-task-workspace.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      await page.getByRole("button", { name: "Back to tasks", exact: true }).click();
      await list.getByRole("button", { name: /Validate reconnect behavior/ }).click();
      await expect(page.getByRole("region", { name: "Task details", exact: true })).toBeFocused();
      await expect(
        page.getByRole("heading", { name: "Validate reconnect behavior", exact: true }),
      ).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-task-workspace-mobile.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Back to tasks", exact: true }).click();
      await expect(list.getByRole("button", { name: /Validate reconnect behavior/ })).toBeFocused();
      await expect(
        list.getByRole("button", { name: /Validate reconnect behavior/ }),
      ).toBeInViewport();
    },
  );
}
