/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentTask, HumanRequest, SyncDevice } from "@raypx/contracts/tasks";
import { DesktopTaskWorkspace } from "../../../../../src/features/tasks/workspace";
import { localTaskClient } from "../../../../../src/features/tasks/local-client";

const mocks = vi.hoisted(() => ({ request: vi.fn(), remote: vi.fn() }));
vi.mock("../../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  localRequest: mocks.request,
  onLocalEvent: () => () => {},
}));
vi.mock("../../../../../src/features/auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "account-a" } }, isPending: false }) },
}));
vi.mock("../../../../../src/features/tasks/client", () => ({
  taskClient: {
    tasks: { list: mocks.remote },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
    subscribe: () => () => {},
  },
}));
let tasks: AgentTask[], request: HumanRequest | undefined;
const device: SyncDevice = {
  id: crypto.randomUUID(),
  name: "Local computer",
  platform: "darwin",
  appVersion: "0.1.0",
  epoch: 1,
  revoked: false,
  lastSeenAt: null,
  online: true,
  projects: [
    { id: crypto.randomUUID(), name: "Local project", providers: ["codex"], dirty: false },
  ],
  capabilities: [{ provider: "codex", available: true, version: "0.163.0", reason: "ready" }],
};
const histories: ReturnType<typeof createMemoryHistory>[] = [];
beforeEach(() => {
  // jsdom has no layout; keep the real virtualizer and supply viewport/row dimensions.
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-task-list") ? 480 : 0;
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(480);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
  tasks = [];
  request = undefined;
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  localTaskClient.setAccount("account-a");
  mocks.remote.mockReset().mockRejectedValue(new Error("API offline"));
  mocks.request
    .mockReset()
    .mockImplementation(
      async (
        method: string,
        params: { request?: { method: string; input: AgentTask }; before?: string; id?: string },
      ) => {
        if (method === "agents.local.device") return device;
        if (method === "agents.local.list")
          return tasks.filter(
            (task) => !params.before || `${task.createdAt}:${task.id}` < params.before,
          );
        if (method === "agents.local.approvals")
          return request?.status === "pending" ? [request] : [];
        if (method === "agents.local.get")
          return {
            task: tasks.find((task) => task.id === params.id),
            events: [],
            requests: request ? [request] : [],
          };
        if (method === "agents.local.execute") {
          if (params.request?.method === "tasks.create") {
            tasks = [
              {
                ...params.request.input,
                parentTaskId: null,
                status: "waiting",
                summary: "",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ];
            request = {
              id: crypto.randomUUID(),
              taskId: tasks[0]!.id,
              kind: "permission",
              title: "Run local tests",
              body: "bun test",
              questions: [],
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              status: "pending",
              decision: null,
            };
            return { ok: true, value: tasks[0] };
          }
          tasks = [{ ...tasks[0]!, status: "succeeded", summary: "Private local result" }];
          request = { ...request!, status: "applied", decision: { type: "allow" } };
          return { ok: true, value: request };
        }
        throw new Error("Unexpected IPC");
      },
    );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localTaskClient.setAccount(null);
  for (const history of histories.splice(0)) history.destroy();
});
async function page() {
  const history = createMemoryHistory({ initialEntries: ["/"] });
  histories.push(history);
  const routeTree = createRootRoute({ component: () => <DesktopTaskWorkspace view="tasks" /> });
  const router = createRouter({ routeTree, history });
  await router.load();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
}
it("defaults to local tasks and completes an approval while the cloud API is unavailable", async () => {
  await page();
  fireEvent.click(await screen.findByRole("button", { name: "New task" }));
  fireEvent.change(screen.getByRole("textbox", { name: "What should the agent do?" }), {
    target: { value: "Keep this task local" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send task" }));
  await screen.findByText("Run local tests");
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  await screen.findByText("Private local result");
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(
    mocks.request.mock.calls.every(([method]) => String(method).startsWith("agents.local.")),
  ).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Connected computers" }));
  await waitFor(() => expect(mocks.remote).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("tab", { name: "This computer" }));
  await screen.findByRole("button", { name: /Keep this task local/ });
});
it("shows local engine recovery feedback without exposing raw IPC errors", async () => {
  mocks.request.mockRejectedValue(new Error("Secret path and native error"));
  await page();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Unable to reach the local engine. Restart it and try again.");
  expect(document.body.textContent).not.toContain("Secret path");
  expect(mocks.remote).not.toHaveBeenCalled();
});
it("opens older tasks after a short page and returns to newer tasks without losing the cursor", async () => {
  tasks = Array.from({ length: 3 }, (_, index) => ({
    id: crypto.randomUUID(),
    deviceId: device.id,
    projectId: device.projects[0]!.id,
    provider: "codex",
    mode: "run",
    prompt: `Task ${index + 1}`,
    status: "succeeded",
    summary: `Result ${index + 1}`,
    parentTaskId: null,
    createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
    updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
  }));
  const original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (method, params) => {
    const value = await original(method, params);
    return method === "agents.local.list" ? value.slice(0, 1) : value;
  });
  await page();
  await screen.findByRole("button", { name: /Task 1/ });
  expect(screen.getByRole("button", { name: "Newer tasks" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Older tasks" }));
  await screen.findByRole("button", { name: /Task 2/ });
  fireEvent.click(screen.getByRole("button", { name: "Older tasks" }));
  fireEvent.click(await screen.findByRole("button", { name: /Task 3/ }));
  await screen.findByText("Result 3");
  expect(screen.getByRole("button", { name: "Older tasks" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Newer tasks" }));
  await screen.findByRole("button", { name: /Task 2/ });
  fireEvent.click(screen.getByRole("button", { name: "Newer tasks" }));
  await screen.findByRole("button", { name: /Task 1/ });
  expect(screen.getByRole("button", { name: "Newer tasks" }).hasAttribute("disabled")).toBe(true);
  expect(mocks.remote).not.toHaveBeenCalled();
});
it("keeps long task lists virtualized while keyboard navigation can reach every task", async () => {
  tasks = Array.from({ length: 100 }, (_, index) => ({
    id: crypto.randomUUID(),
    deviceId: device.id,
    projectId: device.projects[0]!.id,
    provider: "codex",
    mode: "run",
    prompt: `Virtual task ${index + 1}`,
    status: "succeeded",
    summary: `Virtual result ${index + 1}`,
    parentTaskId: null,
    createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
    updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
  }));
  await page();
  const list = await screen.findByRole("list", { name: "Agent tasks" });
  const first = await within(list).findByRole("button", { name: /^Virtual task 1(?!\d)/ });
  expect(within(list).getAllByRole("listitem").length).toBeLessThan(20);
  expect(within(list).queryByRole("button", { name: /Virtual task 100/ })).toBeNull();
  fireEvent.keyDown(first, { key: "End" });
  const last = await within(list).findByRole("button", { name: /Virtual task 100/ });
  await waitFor(() => expect(document.activeElement).toBe(last));
  fireEvent.click(last);
  await screen.findByText("Virtual result 100");
  expect(last.getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(last, { key: "Home" });
  await waitFor(() => expect(document.activeElement).toBe(first));
  fireEvent.keyDown(first, { key: "ArrowDown" });
  const second = await within(list).findByRole("button", { name: /^Virtual task 2(?!\d)/ });
  await waitFor(() => expect(document.activeElement).toBe(second));
});
