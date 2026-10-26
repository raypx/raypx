/** @vitest-environment jsdom */
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentTask, HumanRequest, SyncDevice, TaskActivity } from "@raypx/contracts/tasks";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { DesktopTaskWorkspace } from "../../../../../src/features/tasks/workspace";
import {
  localTaskClient,
  accountLocalTaskClient,
} from "../../../../../src/features/tasks/local-client";

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
vi.mock("../../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  isDaemonDesktop: () => false,
  localRequest: mocks.request,
  onLocalEvent: () => () => {},
}));
vi.mock("../../../../../src/features/auth/client", () => ({
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
vi.mock("../../../../../src/features/tasks/client", () => ({
  taskClient: {
    tasks: { list: mocks.remote },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
    subscribe: () => () => {},
  },
}));
let tasks: AgentTask[], request: HumanRequest | undefined;
let activity: TaskActivity[];
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
beforeEach(() => {
  // jsdom has no layout; keep the real virtualizer and supply viewport/row dimensions.
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-task-list") ? 480 : 0;
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(480);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
  mocks.user = { id: "account-a" };
  accountLocalTaskClient.setAccount("account-a");
  tasks = [];
  activity = [];
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
        if (method === "memory.list") return [];
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
            activity,
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
async function page(url = "/") {
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
async function showDrafts() {
  const trigger = await screen.findByRole("button", { name: "Drafts" });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
}
function runningTask() {
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
  tasks = [task];
  return task;
}
it("shows safe Markdown, proposed Diff and original approval without rendering provider HTML or images", async () => {
  const task = runningTask(),
    now = new Date().toISOString();
  activity = [
    {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "message",
      order: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      status: "complete",
      truncated: false,
      text: "## Plan\n\n**Safe answer**\n\n[Bad link](javascript:alert(1))\n\n![Remote](https://example.com/pixel.png)\n\n<script>window.injected=true</script>",
    },
  ];
  request = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "permission",
    title: "Edit",
    body: JSON.stringify({ file_path: "src/app.ts", old_string: "before", new_string: "after" }),
    questions: [],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    status: "pending",
    decision: null,
  };
  await page();
  fireEvent.click(await screen.findByRole("button", { name: /Improve the current project/ }));
  await screen.findByText("Safe answer");
  expect(document.querySelector("script")).toBeNull();
  expect(document.querySelector("img[src*=pixel]")).toBeNull();
  expect(screen.getByText("Bad link").closest("a")?.getAttribute("href") ?? "").not.toMatch(
    /^javascript:/,
  );
  expect(screen.getByRole("button", { name: "Send now" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Queue next turn" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(await screen.findByRole("cell", { name: "after" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Original request" }));
  await screen.findByText(request.body);
});
it("recovers an accepted queued input after a lost receipt without sending it again", async () => {
  const task = runningTask(),
    original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (method, params) => {
    if (method === "agents.local.execute" && params.request.method === "tasks.input") {
      const input = params.request.input,
        now = new Date().toISOString();
      activity = [
        {
          id: input.id,
          taskId: task.id,
          kind: "input",
          mode: input.mode,
          text: input.prompt,
          status: "queued",
          order: 1,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        },
      ];
      throw new Error("Lost receipt: private transport detail");
    }
    return original(method, params);
  });
  await page();
  fireEvent.click(await screen.findByRole("button", { name: /Improve the current project/ }));
  const input = await screen.findByRole("textbox", { name: "Add an instruction" });
  fireEvent.change(input, { target: { value: "Validate the change next" } });
  fireEvent.click(screen.getByRole("button", { name: "Queue next turn" }));
  await screen.findByText("Validate the change next");
  await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
  expect(
    mocks.request.mock.calls.filter(
      ([method, params]) =>
        method === "agents.local.execute" && params.request.method === "tasks.input",
    ),
  ).toHaveLength(1);
  expect(document.body.textContent).not.toContain("private transport detail");
  expect(screen.queryByRole("alert")).toBeNull();
});
it("runs and approves local tasks without signing in or reaching the cloud", async () => {
  mocks.user = null;
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
    mocks.request.mock.calls.every(
      ([method]) =>
        String(method).startsWith("agents.local.") || String(method).startsWith("memory."),
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Connected computers" }));
  await screen.findByRole("heading", { name: "Sign in for remote access" });
  expect(mocks.remote).not.toHaveBeenCalled();
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

it("saves and restores local drafts without sending a task, and preserves unsaved text on cancel", async () => {
  const first = await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Investigate local reconnects" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved on this device.");
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "New draft" }));
  expect(editor).toHaveValue("");
  fireEvent.change(editor, { target: { value: "Unsaved investigation" } });
  await showDrafts();
  fireEvent.click(screen.getByRole("button", { name: /^Investigate local reconnects/ }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(editor).toHaveValue("Unsaved investigation");
  first.unmount();
  await page();
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Unsaved investigation",
  );
  await showDrafts();
  fireEvent.click(await screen.findByRole("button", { name: /^Investigate local reconnects/ }));
  const discard = await screen.findByRole("alertdialog");
  fireEvent.click(within(discard).getByRole("button", { name: "Discard changes" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Investigate local reconnects",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Delete draft: Investigate local reconnects" }),
  );
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Investigate local reconnects",
  );
});

it("keeps draft text when device storage refuses a write", async () => {
  await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Keep this text" } });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(
    "Unable to read or save drafts on this device. Your current text is still in the editor.",
  );
  expect(editor).toHaveValue("Keep this text");
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
});

it("removes a sent draft only after the task is accepted", async () => {
  await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Validate this saved draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("region", { name: "Drafts" });
  fireEvent.click(screen.getByRole("button", { name: "Send task" }));
  await screen.findByText("Run local tests");
  expect(editor).toHaveValue("");
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
});

it("keeps local drafts separate from drafts for connected computers", async () => {
  mocks.remote.mockResolvedValue([]);
  await page();
  const localEditor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(localEditor, { target: { value: "Private local draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await showDrafts();
  await screen.findByRole("button", { name: /^Private local draft/ });
  fireEvent.click(screen.getByRole("tab", { name: "Connected computers" }));
  const remoteEditor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
  fireEvent.change(remoteEditor, { target: { value: "Connected computer draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await showDrafts();
  await screen.findByRole("button", { name: /^Connected computer draft/ });
  fireEvent.click(screen.getByRole("tab", { name: "This computer" }));
  await showDrafts();
  await screen.findByRole("button", { name: /^Private local draft/ });
  expect(screen.queryByRole("button", { name: /^Connected computer draft/ })).toBeNull();
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
});
it("preserves the local editor and owner through login, account switches, logout and remount", async () => {
  mocks.user = null;
  const first = await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Device-owned unsent work" } });
  for (const user of [{ id: "account-a" }, { id: "account-b" }, null]) {
    await act(async () => {
      mocks.user = user;
      for (const listener of mocks.listeners) listener();
    });
    expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
      "Device-owned unsent work",
    );
  }
  first.unmount();
  await page();
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Device-owned unsent work",
  );
  expect(
    mocks.request.mock.calls.every(([method, params]) =>
      String(method).startsWith("memory.")
        ? params.accountId === undefined
        : params.accountId === LOCAL_WORKSPACE_ID,
    ),
  ).toBe(true);
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
  expect(mocks.remote).not.toHaveBeenCalled();
});
it("keeps earlier account-owned drafts isolated instead of adopting them into the device workspace", async () => {
  const key = JSON.stringify([
    "raypx.task-drafts.v1",
    "https://api.example.test",
    "account-a",
    true,
  ]);
  localStorage.setItem(
    key,
    JSON.stringify([
      {
        id: "legacy-a",
        deviceId: device.id,
        projectId: device.projects[0]!.id,
        provider: "codex",
        mode: "run",
        prompt: "Account A private draft",
        updatedAt: new Date().toISOString(),
      },
    ]),
  );
  await page("/tasks?scope=local&history=account");
  await showDrafts();
  await screen.findByRole("button", { name: /^Account A private draft/ });
  await act(async () => {
    accountLocalTaskClient.setAccount("account-b");
    mocks.user = { id: "account-b" };
    for (const listener of mocks.listeners) listener();
  });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /^Account A private draft/ })).toBeNull(),
  );
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue("");
  await act(async () => {
    accountLocalTaskClient.setAccount(null);
    mocks.user = null;
    for (const listener of mocks.listeners) listener();
  });
  await screen.findByRole("heading", { name: "Sign in for remote access" });
  expect(screen.queryByRole("textbox", { name: "What should the agent do?" })).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)!)[0].prompt).toBe("Account A private draft");
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("collapses an unsent editor without losing its text or creating a task", async () => {
  runningTask();
  await page();
  fireEvent.click(await screen.findByRole("button", { name: "Write a task" }));
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Keep this unsent investigation" } });
  fireEvent.click(screen.getByRole("button", { name: "Collapse task editor" }));
  expect(screen.queryByRole("textbox", { name: "What should the agent do?" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Write a task" }));
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Keep this unsent investigation",
  );
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
});

it("filters a project deep link and lets the user return to all projects", async () => {
  const first = runningTask();
  const second = {
    ...first,
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    prompt: "Other project task",
  };
  tasks = [first, second];
  await page(`/tasks?scope=local&project=${first.projectId}`);
  await screen.findByRole("button", { name: /Improve the current project/ });
  expect(screen.queryByRole("button", { name: /Other project task/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show all projects" }));
  await screen.findByRole("button", { name: /Other project task/ });
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("puts a completed result before the collapsed transcript and keeps full history available", async () => {
  const task = runningTask();
  tasks = [{ ...task, status: "succeeded", summary: "Validated the reconnect fix" }];
  const now = new Date().toISOString();
  activity = [
    {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "message",
      order: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      status: "complete",
      truncated: false,
      text: "Detailed execution transcript",
    },
  ];
  await page();
  fireEvent.click(await screen.findByRole("button", { name: /Improve the current project/ }));
  await screen.findByText("Validated the reconnect fix");
  expect(screen.queryByRole("region", { name: "Conversation" })).toBeNull();
  expect(screen.queryByText("Detailed execution transcript")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View full conversation" }));
  await screen.findByText("Detailed execution transcript");
});

it("restores keyboard focus to the selected task when returning from details", async () => {
  runningTask();
  await page();
  const row = await screen.findByRole("button", { name: /Improve the current project/ });
  fireEvent.click(row);
  fireEvent.click(await screen.findByRole("button", { name: "Back to tasks" }));
  await waitFor(() => expect(document.activeElement).toBe(row));
  expect(row).toHaveAttribute("aria-pressed", "true");
});
