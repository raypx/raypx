import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Page, type Route, type Locator } from "@playwright/test";
import { runSchema } from "@raypx/core/conversation";
import {
  test,
  web,
  capture,
  authResponse,
  signedInAccount,
  webShellFixture,
  accountAccessFixture,
} from "@raypx/e2e/testing";
import { measureTheme } from "./theme-contrast.js";
import { expectEntryFocus, expectKeyboardRing, expectInvalidBorder } from "./theme-focus.js";

const directory = fileURLToPath(new URL("../../../.artifacts/theme/final/", import.meta.url));
const focusDirectory = fileURLToPath(new URL("../../../.artifacts/focus/", import.meta.url));
const createdAt = "2026-11-15T08:00:00.000Z";
const spaceId = "11111111-1111-4111-8111-111111111111";
const names = [
  "Research partner",
  "Writing partner",
  "Planning partner",
  "Data partner",
  "Review partner",
  "Learning partner",
  "Studio partner",
  "Notes partner",
];
const agents = names.map((name, i) => ({
  id: `theme-agent-${i}`,
  spaceId,
  name,
  instructions: "",
  model: { modelId: "studio" },
  createdAt,
  updatedAt: createdAt,
}));
const conversations = agents.map((agent, i) => ({
  id: `theme-conversation-${i}`,
  spaceId,
  agentId: agent.id,
  kind: "direct",
  createdAt,
}));
const group = {
  id: "theme-group",
  spaceId,
  agentId: agents[0]!.id,
  kind: "group",
  name: "Launch discussion",
  agentIds: agents.slice(0, 3).map((a) => a.id),
  createdAt,
};
const availableModes = ["ask", "never", "auto"].map((mode) => ({
  mode,
  available: true,
  reasonCode: null,
}));
const markdown = [
  "### A clear starting point",
  "Keep the first release small. Start with the shared plan, then confirm the next step together.",
  "```ts\nconst plan = { goal: 'A useful first release', steps: 3 };\nawait prepare(plan);\n```",
  "| Step | Owner | Result |\n| --- | --- | --- |\n| Research | Team | Shared context |\n| Draft | Writer | Reviewable outline |\n| Review | Team | Clear next step |",
  "See the [release notes](#release-notes) for the decisions behind this plan.",
].join("\n\n");

async function fixture(page: Page) {
  await webShellFixture(page);
  const account = await signedInAccount(page);
  await accountAccessFixture(page, account.id, "admin");
  let checklist = false;
  let approval = false;
  let protectedInput = false;

  const pending = {
    id: "theme-approval",
    spaceId,
    conversationId: conversations[1]!.id,
    runId: "theme-run-pending",
    memberAccountId: account.id,
    toolCallId: "theme-write",
    toolName: "computer_write_file",
    arguments: {},
    argumentSummary: "Write the shared launch outline for review.",
    target: "launch-outline.md",
    state: "pending",
    createdAt,
    expiresAt: "2026-11-15T08:05:00.000Z",
    resolvedAt: null,
    answeredByAccountId: null,
  };
  function history(conversationId: string) {
    const conversation =
      conversationId === group.id ? group : conversations.find((c) => c.id === conversationId)!;
    const isGroup = conversationId === group.id;
    const isPending = conversationId === conversations[1]!.id;
    const message = {
      id: `message-${conversationId}`,
      spaceId,
      conversationId,
      sequence: 1,
      author: { kind: "member", accountId: account.id },
      text: isGroup
        ? "How should we approach the launch?"
        : isPending
          ? "Save the launch outline for the team to review."
          : "Help me plan a useful first release.",
      createdAt,
    };
    const runs = (isGroup ? agents.slice(0, 3) : [agents[isPending ? 1 : 0]!]).map((agent, i) =>
      runSchema.parse({
        id: isPending ? "theme-run-pending" : `theme-run-${conversationId}-${i}`,
        spaceId,
        conversationId,
        agentId: agent.id,
        trigger: "message",
        messageId: message.id,
        memberAccountId: account.id,
        model: { modelId: "studio" },
        state: isPending ? "waiting" : "succeeded",
        failureCode: null,
        createdAt,
        startedAt: createdAt,
        firstResponseAt: createdAt,
        finishedAt: isPending ? null : createdAt,
      }),
    );
    const reply = markdown;
    const groupText = [
      "I’ve gathered the context. Let’s start with a short research brief and one shared goal.",
      "I can turn that brief into an outline. We should keep the language clear and the scope small.",
      "I’ll organize the next steps: research today, a draft tomorrow, then a team review.",
    ];
    return {
      conversation,
      messages: [message],
      runs,
      segments: runs.map((run, i) => ({
        id: `segment-${run.id}`,
        spaceId,
        conversationId,
        runId: run.id,
        agentId: run.agentId,
        sequence: i + 2,
        text: isGroup
          ? groupText[i]
          : isPending
            ? "The outline is ready. I need your approval before saving it."
            : reply,
        createdAt,
      })),
      cursor: 10,
      olderCursor: null,
      runsTruncated: false,
      segmentsTruncated: false,
      toolActivity: [],
      participants: [{ accountId: account.id, displayName: "Studio owner", isMember: true }],
      activeRuns: [],
      activeRunsTruncated: false,
    };
  }
  await page.routeWebSocket("**/api/events", (socket) => {
    socket.send(JSON.stringify({ type: "ready", version: 1 }));
    socket.onMessage(() => {});
  });
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    Object.assign(window, {
      fetch(input: RequestInfo | URL, init?: RequestInit) {
        const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
        if (url.pathname !== "/api/events" || !url.searchParams.has("conversationId"))
          return fetch(input, init);
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"ready","version":1}\n\n'));
          },
        });
        return Promise.resolve(
          new Response(stream, {
            headers: { "content-type": "text/event-stream" },
          }),
        );
      },
    });
  });
  const unexpected = new Set<string>();
  await page.route("**/api/rpc/**", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
    const method = new URL(route.request().url()).pathname.split("/api/rpc/")[1]!;
    const raw = route.request().postDataJSON() as { json?: { conversationId?: string } } | null;
    const input = raw?.json ?? {};
    const values: Record<string, unknown> = {
      "account/get": { id: account.id, name: "Studio owner", email: "studio@example.test" },
      "configuration/access": { allowed: true },
      "configuration/public": {
        siteName: "Raypx",
        registrationEnabled: true,
        bootstrap: false,
        setupTokenRequired: false,
        mailConfigured: false,
      },
      "configuration/get": {
        values: { siteName: "Raypx", registrationEnabled: true, cleanupEnabled: true },
        revision: 1,
        updatedAt: null,
        deployment: { jobsEnabled: false, mailConfigured: false },
      },
      "configuration/storage": { values: null, revision: 0, updatedAt: null },
      "configuration/resend": { values: null, revision: 0, updatedAt: null },
      "configuration/sandbox": {
        values: { provider: "none", url: null, screen: false },
        hasCredential: false,
        revision: 0,
        updatedAt: null,
      },
      "configuration/setupStatus": checklist
        ? { model: true, sandbox: false, mail: false }
        : { model: true, sandbox: true, mail: true },
      "spaces/list": [
        {
          space: { id: spaceId, name: "Design studio", createdAt, updatedAt: createdAt },
          member: { spaceId, accountId: account.id, role: "owner", createdAt },
        },
      ],
      "admin/audit": { entries: [], next: null },
      "skills/list": [],
      "mcpServers/list": [],
      "openApiServers/list": [],
      "spaces/settings": { spaceId, approvalMode: null },
      "spaces/invitations": [],
      "spaces/get": { id: spaceId, name: "Design studio", createdAt, updatedAt: createdAt },
      "spaces/members": [
        {
          spaceId,
          accountId: account.id,
          name: "Studio owner",
          image: null,
          role: "owner",
          createdAt,
        },
      ],
      "deviceComputers/getSelection": { selection: null },
      "agents/list": agents.map((agent, i) => ({ agent, conversation: conversations[i] })),
      "agents/models": [{ modelId: "studio", name: "Studio model", source: "deployment" }],
      "conversations/listGroups": [group],
      "conversations/getGroup": group,
      "computers/get": {
        status: "available",
        computer: {
          id: "22222222-2222-4222-8222-222222222222",
          spaceId,
          scope: "team",
          agentId: null,
          provider: "memory",
          state: "running",
          generation: 1,
          homeRevision: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          leaseFence: 0,
          failureCode: null,
          createdAt,
          updatedAt: createdAt,
        },
      },
      "computers/screenAvailability": { status: "not-configured" },
      "computers/listFiles": { status: "available", entries: [], truncated: false },
      "approvals/effectiveMode": {
        spaceId,
        mode: "ask",
        source: "account_default",
        availableModes,
      },
      "approvals/settings": { mode: "ask", rules: [], revision: 0, availableModes },
      "approvals/pending": approval ? [pending] : [],
      "routines/list": [],
      "notifications/list": { items: [], truncated: false },
      "notifications/viewed": { ok: true },
      "deviceComputers/list": { devices: [] },
      "deviceComputers/selection": null,
      "protectedInputs/pending": protectedInput
        ? [
            {
              id: "33333333-3333-4333-8333-333333333333",
              spaceId,
              conversationId: conversations[1]!.id,
              runId: "theme-run-pending",
              memberAccountId: account.id,
              toolCallId: "theme-protected",
              toolName: "computer_run_command",
              target: "release preview",
              input: {
                name: "Preview access",
                purpose: "Authenticate this one preview request.",
                destination: { kind: "stdin" },
              },
              untrustedInput: false,
              provenanceKind: null,
              state: "pending",
              createdAt,
              expiresAt: "2026-11-15T08:05:00.000Z",
              resolvedAt: null,
            },
          ]
        : [],
    };
    if (method === "account/access") return route.fallback();
    if (method === "conversations/history" || method === "conversations/snapshot")
      return authResponse(route, { json: history(input.conversationId ?? conversations[0]!.id) });
    if (Object.hasOwn(values, method)) return authResponse(route, { json: values[method] });
    unexpected.add(method);
    return authResponse(route, { json: [] });
  });
  return {
    setChecklist: (v: boolean) => {
      checklist = v;
    },
    setApproval: (v: boolean) => {
      approval = v;
    },
    setProtected: (v: boolean) => {
      protectedInput = v;
    },
    unexpected,
  };
}

test.use({
  trace: "off",
  actionTimeout: 10_000,
  video: "off",
  screenshot: "off",
  reducedMotion: "reduce",
  viewport: { width: 1440, height: 860 },
});
test("verifies the shared color system and compiled focus treatments", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-11-15T08:00:00.000Z"));
  const f = await fixture(page);
  await page.addInitScript(() => {
    localStorage.setItem("theme", "system");
    localStorage.setItem("raypx_locale", "en");
    localStorage.setItem("raypx_sidebar_open", "true");
  });
  await mkdir(directory, { recursive: true });
  await mkdir(focusDirectory, { recursive: true });
  const measurements = [];
  const focusMeasurements: {
    theme: "light" | "dark";
    name: string;
    styles:
      | Awaited<ReturnType<typeof expectEntryFocus>>
      | Awaited<ReturnType<typeof expectInvalidBorder>>;
  }[] = [];
  const home = `${web}/agents?spaceId=${spaceId}`;
  async function open(suffix = "") {
    await page.goto(home + suffix);
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    await expect(
      page.locator("[data-workspace-home], [data-conversation-header]").first().or(retry).first(),
    ).toBeVisible();
    if (await retry.isVisible()) await retry.click();
    await expect(
      page.locator("[data-workspace-home], [data-conversation-header]").first(),
    ).toBeVisible();
  }
  async function shot(target: Page, theme: string, screen: string) {
    await expect(target.locator("html")).toHaveAttribute("data-theme", theme);
    await target.mouse.move(0, 0);
    expect(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await capture(target, { path: `${directory}/${theme}-${screen}.png` });
  }
  const publicContext = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    reducedMotion: "reduce",
    locale: "en-US",
  });
  const publicPage = await publicContext.newPage();
  publicPage.on("pageerror", (error) => errors.push(error.message));
  await publicPage.addInitScript(() => {
    localStorage.setItem("theme", "system");
    localStorage.setItem("raypx_locale", "en");
  });
  await accountAccessFixture(publicPage, null);
  await publicPage.route("**/api/auth/**", (route) => authResponse(route, null));
  await publicPage.route("**/api/rpc/configuration/public", (route) =>
    authResponse(route, {
      json: {
        siteName: "Raypx",
        registrationEnabled: true,
        bootstrap: false,
        setupTokenRequired: false,
        mailConfigured: false,
      },
    }),
  );
  await publicPage.route("**/api/rpc/configuration/access", (route) =>
    authResponse(route, { json: { allowed: false } }),
  );
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 1440, height: 860 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    f.setChecklist(false);
    f.setApproval(false);
    f.setProtected(false);
    await open();
    await shot(page, theme, "home");
    measurements.push({ theme, ...(await measureTheme(page)) });
    async function focusShot(
      name: string,
      styles: Awaited<ReturnType<typeof expectEntryFocus>>,
      target = page,
    ) {
      focusMeasurements.push({ theme, name, styles });
      await capture(target, { path: `${focusDirectory}/after-${theme}-${name}.png` });
    }
    async function invalidShots(
      name: string,
      control: Locator,
      surface = control,
      target = page,
      focusStates: readonly boolean[] = [false, true],
    ) {
      const styles = await expectInvalidBorder(
        control,
        surface,
        async (focused) => {
          const suffix = focused ? "" : "-unfocused";
          await capture(target, {
            path: `${focusDirectory}/after-${theme}-invalid-${name}${suffix}.png`,
          });
        },
        focusStates,
      );
      focusMeasurements.push({ theme, name: `invalid-${name}`, styles });
    }
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    const composerSurface = page.locator("[data-composer-card]");
    await focusShot("composer", await expectEntryFocus(composer, composerSurface));
    await focusShot(
      "select",
      await expectEntryFocus(page.getByRole("combobox", { name: "Choose an Agent", exact: true })),
    );
    await invalidShots(
      "select",
      page.getByRole("combobox", { name: "Choose an Agent", exact: true }),
    );
    await focusShot(
      "icon-button",
      await expectKeyboardRing(page.getByRole("button", { name: "Add context", exact: true })),
    );
    await invalidShots("composer", composer, composerSurface);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const commandSearch = page.locator('[data-slot="combobox-input"]');
    const commandSurface = commandSearch.locator("..");
    await focusShot("command-search", await expectEntryFocus(commandSearch, commandSurface));
    await invalidShots("command-search", commandSearch, commandSurface);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "New Agent", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "New Agent", exact: true });
    const instructions = editor.getByRole("textbox", { name: "Instructions", exact: true });
    await focusShot("textarea", await expectEntryFocus(instructions));
    await invalidShots("textarea", instructions);
    await page.keyboard.press("Escape");
    await open(`&agentId=${agents[0]!.id}`);
    await expect(page.getByText("A clear starting point", { exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("[data-code-language]")).toHaveText("ts");
    await shot(page, theme, "conversation");
    f.setApproval(true);
    await open(`&agentId=${agents[1]!.id}`);
    await expect(page.locator("[data-approval-card]")).toBeVisible();
    await shot(page, theme, "approval");
    f.setApproval(false);
    await open(`&groupId=${group.id}`);
    await expect(page.locator("[data-reply-bubble]")).toHaveCount(3);
    await shot(page, theme, "group");
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("@");
    const mentionSearch = page.locator('[data-slot="combobox-input"]');
    await focusShot("combobox", await expectEntryFocus(mentionSearch));
    // The transient picker retains input focus while open; closing removes it.
    // Persistent Select above covers both focused and unfocused invalid controls.
    await invalidShots("combobox", mentionSearch, mentionSearch, page, [true]);
    await page.keyboard.press("Escape");
    await expect(mentionSearch).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeFocused();
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    await shot(page, theme, "settings");
    await page.keyboard.press("Escape");
    await page.goto(`${home}#settings/account`);
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    const settingsSearch = page.getByRole("searchbox", { name: "Search settings", exact: true });
    await focusShot(
      "settings-search",
      await expectEntryFocus(
        settingsSearch,
        page
          .getByRole("dialog", { name: "Settings", exact: true })
          .locator('[data-slot="input-group"]'),
      ),
    );
    await focusShot(
      "settings-input",
      await expectEntryFocus(page.getByRole("textbox", { name: "Display name", exact: true })),
    );
    await page.keyboard.press("Escape");
    f.setChecklist(true);
    await open();
    await expect(page.locator("[data-setup-checklist]")).toBeVisible();
    await shot(page, theme, "setup");
    f.setChecklist(false);
    await page.getByRole("link", { name: "Sandbox", exact: true }).click();
    const adminTitle = page.getByRole("heading", {
      level: 1,
      name: "Configuration center",
      exact: true,
    });
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    await expect(adminTitle.or(retry).first()).toBeVisible();
    if (await retry.isVisible()) await retry.click();
    await expect(adminTitle).toBeVisible();
    const sandbox = page.getByRole("tab", { name: "Sandbox", exact: true });
    await expect(sandbox).toHaveAttribute("aria-selected", "true");
    await expect(sandbox.locator("svg")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Provider", exact: true })).toBeVisible();
    await shot(page, theme, "admin-configuration");
    await page.getByRole("link", { name: "Audit log", exact: true }).click();
    const dateRange = page.locator("#audit-range");
    await expect(dateRange.or(retry).first()).toBeVisible();
    if (await retry.isVisible()) await retry.click();
    await expect(dateRange).toBeVisible();
    await focusShot("audit-date-range", await expectEntryFocus(dateRange));
    await invalidShots("date-range", dateRange);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(`&agentId=${agents[0]!.id}`);
    await expect(page.getByText("A clear starting point", { exact: true })).toBeVisible();
    await shot(page, theme, "390-conversation");
    f.setApproval(true);
    await open(`&agentId=${agents[1]!.id}`);
    await expect(page.locator("[data-approval-card]")).toBeVisible();
    await shot(page, theme, "390-approval");
    await publicPage.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const [route, screen] of [
      ["", "landing"],
      ["signup", "sign-up"],
      ["login", "sign-in"],
    ]) {
      await publicPage.goto(`${web}/${route}`);
      await expect(publicPage.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "signup")
        await expect(
          publicPage.getByRole("button", { name: "Create account", exact: true }),
        ).toBeVisible();
      await shot(publicPage, theme, screen!);
      if (route === "login") {
        const email = publicPage.getByRole("textbox", { name: "Email address", exact: true });
        await focusShot("login-input", await expectEntryFocus(email), publicPage);
        await invalidShots("input", email, email, publicPage);
        await focusShot(
          "button",
          await expectKeyboardRing(
            publicPage.getByRole("button", { name: "Sign in", exact: true }),
          ),
          publicPage,
        );
      }
    }
  }
  await writeFile(
    `${focusDirectory}/production-measurements.json`,
    JSON.stringify(focusMeasurements, null, 2),
  );
  await publicContext.close();
  await writeFile(`${directory}/measurements.json`, JSON.stringify(measurements, null, 2));
  expect(errors).toEqual([]);
  expect([...f.unexpected]).toEqual([]);
  for (const m of measurements)
    for (const pair of m.ratios)
      expect(pair.ratio, `${m.theme} ${pair.text}/${pair.surface}`).toBeGreaterThanOrEqual(
        pair.text === "ring" ? 3 : 4.5,
      );
});
