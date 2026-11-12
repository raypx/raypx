import { expect, type Page } from "@playwright/test";
import { test, selectOption } from "@raypx/e2e/testing";
import { desktopClientFrameSchema, type DesktopChannel } from "@raypx/contracts/desktop";
import type { LocalClientMethod, LocalResult } from "@raypx/contracts/local-client";
import type { SyncDevice } from "@raypx/contracts/tasks";
import type { ModelCatalog, ModelSelection } from "@raypx/core/tasks";

const first: ModelSelection = { provider: "local", model: "atlas", connectionId: "a".repeat(64) };
const second: ModelSelection = { ...first, connectionId: "b".repeat(64) };
const firstOrigin = "https://primary.example.test";
const secondOrigin = "https://secondary.example.test";
const catalog: ModelCatalog = {
  default: first,
  models: [first, second].map((selection, index) => ({
    id: selection.model,
    name: "Atlas",
    provider: selection.provider,
    selection,
    api: "openai-completions",
    input: ["text"],
    reasoning: false,
    contextWindow: 4096,
    maxTokens: 512,
    configured: true,
    origin: index === 0 ? firstOrigin : secondOrigin,
  })),
};

async function fixtureModelChannel(page: Page, device: SyncDevice) {
  const channel: DesktopChannel = {
    protocol: 1,
    url: "ws://127.0.0.1:43171/desktop",
    capability: "x".repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const savedDefaults: unknown[] = [];
  const unexpected: string[] = [];
  const localReads = {
    "instance.status": { state: "registered" },
    "instance.refresh": { state: "registered" },
    "roots.list": device.projects.map(({ id, name }) => ({
      id,
      name,
      path: "/browser-fixture/model-picker",
      createdAt: "2026-01-01T00:00:00.000Z",
    })),
    "agents.local.device": device,
    "agents.local.list": [],
    "agents.local.approvals": [],
    "agents.models.list": catalog,
    "memory.list": [],
  } satisfies Partial<{ [M in LocalClientMethod]: LocalResult<M> }>;
  const reads: Readonly<Record<string, unknown>> = localReads;

  await page.addInitScript((descriptor) => {
    // Only preload values are stubbed here. Product requests use the renderer WebSocket.
    Object.assign(window, {
      __raypxDesktopHost: "mygo",
      __raypxConnection: { apiUrl: "https://api.example.test", webUrl: "https://app.example.test" },
      mygo: {
        async call(binding: string, method: string) {
          if (binding === "Desktop.Request" && method === "get_channel") return descriptor;
          if (binding === "Desktop.Request" && method === "get_runtime")
            return {
              appVersion: "0.1.0",
              platform: "darwin",
              trayEnabled: false,
              engine: { status: "ready" },
            };
          if (binding === "Desktop.Request" && method === "get_analytics_preferences")
            return { enabled: false };
          throw new Error(`Unexpected preload call: ${binding}.${method}`);
        },
      },
    });
  }, channel);
  await page.routeWebSocket(channel.url, (socket) => {
    socket.onMessage((message) => {
      const frame = desktopClientFrameSchema.parse(JSON.parse(message.toString()));
      if (frame.type === "authenticate") {
        socket.send(JSON.stringify({ type: "ready", protocol: 1, streamId: crypto.randomUUID() }));
        return;
      }
      if (frame.type !== "request") return;
      const reply = (result: unknown) =>
        socket.send(JSON.stringify({ type: "response", id: frame.id, result }));
      if (frame.method === "local_request") {
        const { method, params } = frame.params as { method: string; params: unknown };
        if (Object.hasOwn(reads, method)) return reply(reads[method]);
        if (method === "agents.models.setDefault") {
          savedDefaults.push(params);
          return reply({ default: second });
        }
        unexpected.push(method);
      } else if (frame.method === "api_fetch") {
        const { path } = frame.params as { path: string };
        if (path.startsWith("/api/auth/get-session"))
          return reply({
            status: 200,
            headers: { "content-type": "application/json" },
            body: "null",
          });
        unexpected.push(path);
      } else {
        unexpected.push(frame.method);
      }
      socket.send(
        JSON.stringify({
          type: "response",
          id: frame.id,
          error: { code: "FIXTURE_UNEXPECTED_REQUEST", message: "Unexpected fixture request" },
        }),
      );
    });
  });
  return { savedDefaults, unexpected };
}

test("selects and saves the correct local model when two connections share a model name", async ({
  page,
  base,
}) => {
  const projectId = crypto.randomUUID();
  const device: SyncDevice = {
    id: crypto.randomUUID(),
    name: "Local browser fixture",
    platform: "darwin",
    appVersion: "0.1.0",
    epoch: 1,
    revoked: false,
    online: true,
    lastSeenAt: null,
    projects: [{ id: projectId, name: "Model picker project", providers: ["pi"], dirty: false }],
    capabilities: [
      {
        provider: "pi",
        available: true,
        version: "0.1.0",
        reason: "ready",
        definition: {
          version: 1,
          runtime: "sdk",
          modes: ["run"],
          approvals: false,
          modelSelection: true,
        },
        inputModes: ["queue"],
      },
    ],
  };
  const { savedDefaults, unexpected } = await fixtureModelChannel(page, device);
  await page.goto(`${base}/tasks?scope=local&device=${device.id}&project=${projectId}`);
  const newSession = page.getByRole("button", { name: "New session", exact: true });
  await expect(newSession).toBeVisible();
  await newSession.click();
  const form = page.getByRole("form", { name: "New session", exact: true });
  await selectOption(page, form.getByRole("combobox", { name: "Agent", exact: true }), "pi");

  const trigger = form.getByRole("combobox", { name: "Model", exact: true });
  const search = page.getByRole("combobox", { name: "Search models…", exact: true });
  const original = page.getByRole("option", {
    name: `local · Atlas · ${firstOrigin}`,
    exact: true,
  });
  const target = page.getByRole("option", { name: `local · Atlas · ${secondOrigin}`, exact: true });
  await expect(trigger).toHaveText("local · Atlas");
  await trigger.press("Enter");
  await expect(page.getByRole("dialog", { name: "Model", exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  await expect(original).toHaveAttribute("aria-selected", "true");
  await search.fill("LOCAL");
  await expect(target).toBeVisible();
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute(
    "aria-activedescendant",
    (await target.getAttribute("id")) ?? "",
  );
  await search.press("Enter");
  await expect(trigger).toBeFocused();

  await trigger.press("Enter");
  await expect(target).toHaveAttribute("aria-selected", "true");
  await search.fill("missing model");
  await expect(page.getByText("No matching models.", { exact: true })).toBeVisible();
  await search.press("Escape");
  await expect(trigger).toBeFocused();
  expect(savedDefaults).toEqual([]);

  await trigger.press("Enter");
  await expect(search).toHaveValue("");
  await expect(target).toHaveAttribute("aria-selected", "true");
  await search.press("Escape");
  await form.getByRole("button", { name: "Use as device default", exact: true }).click();
  await expect.poll(() => savedDefaults).toEqual([{ model: second }]);
  expect(unexpected).toEqual([]);
});
