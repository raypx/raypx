import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SyncDevice } from "@raypx/contracts/tasks";
import type { AgentTask, HumanRequest, TaskActivity } from "@raypx/core/tasks";
import { DesktopTaskWorkspace } from "../../../src/features/tasks/workspace";
import { localTaskClient } from "../../../src/features/tasks/local-client";
// Register matchers with the active Vite+ test runtime.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  remote: vi.fn(),
  user: { id: "account-a" } as { id: string } | null,
  listeners: new Set<() => void>(),
}));
export { mocks };
vi.mock("../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  hasTerminalHooks: () => false,
  localRequest: mocks.request,
  onLocalEvent: () => () => {},
}));
vi.mock("../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: {
    useSession: () => {
      const user = useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => {
            mocks.listeners.delete(listener);
          };
        },
        () => mocks.user,
      );
      return { data: user ? { user } : null, isPending: false, error: null };
    },
  },
}));
vi.mock("../../../src/features/tasks/client", () => ({
  taskClient: {
    tasks: { list: mocks.remote },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
    subscribe: () => () => {},
  },
}));
export const state: {
  tasks: AgentTask[];
  request: HumanRequest | undefined;
  activity: TaskActivity[];
} = { tasks: [], request: undefined, activity: [] };
export const device: SyncDevice = {
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
  capabilities: [
    {
      provider: "codex",
      available: true,
      version: "0.163.0",
      reason: "ready",
      inputModes: ["steer", "queue"],
    },
  ],
};
const histories: ReturnType<typeof createMemoryHistory>[] = [];
export function setupWorkspaceTests() {
  beforeEach(() => {
    // happy-dom has no layout; keep the real virtualizer and supply viewport/row dimensions.
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute("data-task-list") || this.hasAttribute("data-conversation")
        ? 480
        : 0;
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute("data-conversation"))
        return (
          Number.parseFloat((this.firstElementChild as HTMLElement)?.style.height ?? "0") || 480
        );
      return 480;
    });
    vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      this.scrollTop = typeof options === "number" ? (y ?? 0) : (options?.top ?? 0);
      queueMicrotask(() => this.dispatchEvent(new Event("scroll")));
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(480);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
    mocks.user = { id: "account-a" };
    state.tasks = [];
    state.activity = [];
    state.request = undefined;
    localStorage.clear();
    localStorage.setItem("raypx_locale", "en");
    mocks.remote.mockReset().mockRejectedValue(new Error("API offline"));
    mocks.request
      .mockReset()
      .mockImplementation(
        async (
          method: string,
          params: { request?: { method: string; input: AgentTask }; before?: string; id?: string },
        ) => {
          if (method === "agents.local.device") return device;
          if (method === "memory.list") return [];
          if (method === "agents.local.list")
            return state.tasks.filter(
              (task) => !params.before || `${task.createdAt}:${task.id}` < params.before,
            );
          if (method === "agents.local.approvals")
            return state.request?.status === "pending" ? [state.request] : [];
          if (method === "agents.local.get")
            return {
              task: state.tasks.find((task) => task.id === params.id),
              events: [],
              requests: state.request ? [state.request] : [],
              activity: state.activity,
            };
          if (method === "agents.local.execute") {
            if (params.request?.method === "tasks.create") {
              state.tasks = [
                {
                  ...params.request.input,
                  parentTaskId: null,
                  status: "waiting",
                  summary: "",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ];
              state.request = {
                id: crypto.randomUUID(),
                taskId: state.tasks[0]!.id,
                kind: "permission",
                title: "Run local tests",
                body: "bun test",
                questions: [],
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: "pending",
                decision: null,
              };
              return { ok: true, value: state.tasks[0] };
            }
            state.tasks = [
              { ...state.tasks[0]!, status: "succeeded", summary: "Private local result" },
            ];
            state.request = { ...state.request!, status: "applied", decision: { type: "allow" } };
            return { ok: true, value: state.request };
          }
          throw new Error("Unexpected IPC");
        },
      );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    for (const history of histories.splice(0)) history.destroy();
  });
  return { localTaskClient };
}
export async function page(url = "/") {
  const history = createMemoryHistory({ initialEntries: [url] });
  histories.push(history);
  const routeTree = createRootRoute({ component: () => <DesktopTaskWorkspace view="tasks" /> });
  const router = createRouter({ routeTree, history });
  await router.load();
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
}
export async function showDrafts() {
  const trigger = await screen.findByRole("button", { name: "Drafts" });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
}
export function runningTask() {
  const task: AgentTask = {
    id: crypto.randomUUID(),
    deviceId: device.id,
    projectId: device.projects[0]!.id,
    provider: "codex",
    mode: "run",
    prompt: "Improve the current project",
    status: "running",
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.tasks = [task];
  return task;
}
