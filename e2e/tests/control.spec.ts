import { expect, test } from "@playwright/test";
import {
  createApiClient,
  type ApiClient,
  type RelayClientFrame,
  type RelayServerFrame,
} from "@raypx/client";
const apiUrl = process.env.CONTROL_E2E_API_URL;
test.skip(
  !apiUrl,
  "Requires the isolated real-backend relay fixture and matching Web/Desktop builds",
);
test("relays a task from mobile Web, applies an approval on Desktop and pushes the host result", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const taskPrompt = `Validate the current project ${crypto.randomUUID()}`;
  const login = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
    headers: { origin: "http://127.0.0.1:4173" },
    data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
  });
  expect(login.status()).toBe(200);
  const cookie = (await context.cookies(apiUrl))
      .map((value) => `${value.name}=${value.value}`)
      .join("; "),
    api = createApiClient({ baseUrl: apiUrl!, headers: { cookie } }),
    account = await api.account.get({});
  const grant = await api.devices.register({
    installationId: crypto.randomUUID(),
    name: "Test workstation",
    platform: "test",
    appVersion: "0.1.0",
    reconnect: false,
  });
  const url = new URL("/relay", apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("account", account.id);
  const socket = new WebSocket(url),
    messages: RelayServerFrame[] = [];
  let closed: number | undefined;
  socket.addEventListener("message", (event) =>
    messages.push(JSON.parse(String(event.data)) as RelayServerFrame),
  );
  socket.addEventListener("close", (event) => {
    closed = event.code;
  });
  const take = async <T extends RelayServerFrame["type"]>(type: T) => {
    await expect.poll(() => messages.some((frame) => frame.type === type)).toBe(true);
    return messages.splice(
      messages.findIndex((frame) => frame.type === type),
      1,
    )[0] as Extract<RelayServerFrame, { type: T }>;
  };
  const send = (frame: RelayClientFrame) => socket.send(JSON.stringify(frame));
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Relay unavailable")), { once: true });
  });
  try {
    send({ type: "auth", role: "device", token: grant.token });
    await take("ready");
    const projectId = crypto.randomUUID(),
      streamId = crypto.randomUUID();
    send({
      type: "announce",
      streamId,
      instanceId: crypto.randomUUID(),
      projects: [{ id: projectId, name: "Current project", providers: ["codex"], dirty: true }],
      capabilities: [{ provider: "codex", available: true, version: "0.163.0", reason: "ready" }],
    });
    await take("resume");
    send({
      type: "snapshot",
      id: crypto.randomUUID(),
      streamId,
      sequence: 0,
      records: [],
      done: true,
    });
    await take("ack");
    send({ type: "available" });
    await expect
      .poll(
        async () =>
          (await api.devices.list({})).find((device) => device.id === grant.deviceId)?.online,
      )
      .toBe(true);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("http://127.0.0.1:4173/tasks");
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Computer", exact: true })
      .selectOption(grant.deviceId);
    await page.getByRole("combobox", { name: "Project", exact: true }).selectOption(projectId);
    await page.getByRole("combobox", { name: "Agent", exact: true }).selectOption("codex");
    await page
      .getByRole("textbox", { name: "What should the agent do?", exact: true })
      .fill(taskPrompt);
    await expect(
      page.getByText("This project has uncommitted changes.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Send task", exact: true }).click();
    const start = await take("command");
    if (start.command.request.method !== "tasks.create")
      throw new Error("Unexpected relay command");
    type Task = Awaited<ReturnType<ApiClient["tasks"]["get"]>>["task"];
    const task: Task = {
      ...start.command.request.input,
      status: "waiting",
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const request = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "permission" as const,
      title: "Run project tests",
      body: "bun test\n<img src=x onerror=alert('untrusted')>",
      questions: [],
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      status: "pending" as const,
      decision: null,
    };
    send({
      type: "events",
      streamId,
      events: [
        {
          sequence: 1,
          event: {
            id: crypto.randomUUID(),
            taskId: task.id,
            kind: "status",
            status: "waiting",
            summary: "",
            task,
          },
        },
        {
          sequence: 2,
          event: { id: crypto.randomUUID(), taskId: task.id, kind: "request", request },
        },
      ],
    });
    await take("ack");
    send({ type: "result", routeId: start.routeId, result: { ok: true, value: task } });
    const desktop = await context.newPage();
    await desktop.setViewportSize({ width: 1280, height: 900 });
    await desktop.goto("http://127.0.0.1:4174/approvals");
    await desktop.getByRole("tab", { name: "Connected computers", exact: true }).click();
    await expect(
      desktop.getByRole("heading", { name: "Run project tests", exact: true }),
    ).toBeVisible();
    await expect(desktop.locator("[data-tasks] img")).toHaveCount(0);
    await desktop.getByRole("button", { name: "Allow once", exact: true }).click();
    const decision = await take("command");
    expect(decision.command.request.method).toBe("approvals.decide");
    const decided = {
      ...request,
      status: "decided" as const,
      decision: { type: "allow" as const },
    };
    send({
      type: "events",
      streamId,
      events: [
        {
          sequence: 3,
          event: { id: crypto.randomUUID(), taskId: task.id, kind: "request", request: decided },
        },
      ],
    });
    await take("ack");
    await expect(desktop.getByText("Waiting for the computer to apply your answer.")).toBeVisible();
    const applied = { ...decided, status: "applied" as const },
      completed: Task = {
        ...task,
        status: "succeeded",
        summary: "Validated without modifying existing files.",
      };
    send({
      type: "events",
      streamId,
      events: [
        {
          sequence: 4,
          event: { id: crypto.randomUUID(), taskId: task.id, kind: "request", request: applied },
        },
        {
          sequence: 5,
          event: {
            id: crypto.randomUUID(),
            taskId: task.id,
            kind: "status",
            status: "succeeded",
            summary: completed.summary,
            task: completed,
          },
        },
      ],
    });
    await take("ack");
    send({ type: "result", routeId: decision.routeId, result: { ok: true, value: applied } });
    await expect(page.getByText(completed.summary, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath("relay-mobile-en.png"), fullPage: true });
    await desktop.goto("http://127.0.0.1:4174/tasks");
    await desktop.getByRole("tab", { name: "Connected computers", exact: true }).click();
    await desktop.getByRole("button", { name: new RegExp(taskPrompt) }).click();
    await expect(desktop.getByText(completed.summary, { exact: true })).toBeVisible();
    await page.goto("http://127.0.0.1:4173/settings");
    await page.getByRole("combobox", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "简体中文", exact: true }).click();
    await page.getByRole("radio", { name: "深色", exact: true }).check();
    await page.goto("http://127.0.0.1:4173/tasks");
    await expect(page.getByRole("heading", { name: "Agent 任务", exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("relay-mobile-dark-zh.png"),
      fullPage: true,
    });
    await api.devices.revoke({ deviceId: grant.deviceId, epoch: grant.epoch });
    await expect.poll(() => closed).toBe(4003);
    await expect
      .poll(
        async () =>
          (await api.devices.list({})).find((device) => device.id === grant.deviceId)?.online,
      )
      .toBe(false);
    await desktop.close();
  } finally {
    socket.close();
  }
});
