import { mockTaskLayout } from "../../helpers/layout.js";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskWorkspace } from "@raypx/tasks/client";
import type { AgentTask, SyncDevice } from "@raypx/tasks";
import type { TaskClient } from "@raypx/client";
import { selectOption } from "../../helpers/select.js";

beforeEach(() => {
  // Keep the real virtualizer while supplying happy-dom's missing layout dimensions.
  mockTaskLayout("list");
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());

function computer(name: string): SyncDevice {
  return {
    id: crypto.randomUUID(),
    name,
    platform: "darwin",
    appVersion: "1.0.0",
    epoch: 2,
    revoked: false,
    lastSeenAt: null,
    online: true,
    projects: [],
    capabilities: [],
  };
}
const mac = computer("Studio MacBook");
const windows = computer("Windows workstation");

function task(prompt: string, changes: Partial<AgentTask> = {}): AgentTask {
  return {
    id: crypto.randomUUID(),
    deviceId: mac.id,
    projectId: crypto.randomUUID(),
    provider: "codex",
    mode: "run",
    prompt,
    status: "running",
    summary: "",
    parentTaskId: null,
    createdAt: "2026-10-24T03:00:00Z",
    updatedAt: "2026-10-24T03:00:00Z",
    ...changes,
  };
}

const sampleTasks = [
  task("Investigate build"),
  task("Write deployment guide", {
    provider: "claude",
    status: "succeeded",
    summary: "Verified checklist",
  }),
  task("Review approval", { deviceId: windows.id, provider: "claude", status: "waiting" }),
  task("Retry delivery", { deviceId: windows.id, status: "delivery_failed" }),
];

function workspace(
  tasks = sampleTasks,
  list = vi.fn(async (input: { limit?: number; before?: string }) =>
    input.limit === 1 ? [] : tasks,
  ),
) {
  const client = {
    tasks: { list },
    devices: { list: async () => [mac, windows] },
    approvals: { list: async () => [] },
  } as unknown as TaskClient;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <TaskWorkspace
          client={client}
          scope={{ kind: "remote", namespace: "default", accountId: "account" }}
        />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { list };
}

function visiblePrompts() {
  const list = screen.getByRole("list", { name: "Agent tasks" });
  return within(list)
    .getAllByRole("button")
    .map((button) => button.querySelector("span")?.textContent);
}

it.each([
  ["  BUILD  ", ["Investigate build"]],
  ["checklist", ["Write deployment guide"]],
  ["WINDOWS", ["Review approval", "Retry delivery"]],
])("searches the current page by prompt, result or computer: %s", async (query, expected) => {
  const { list } = workspace();
  const search = await screen.findByRole("searchbox", { name: "Search this page" });
  await screen.findByRole("button", { name: /Investigate build/ });
  const callsBeforeFiltering = list.mock.calls.length;
  fireEvent.change(search, { target: { value: query } });
  await waitFor(() => expect(visiblePrompts()).toEqual(expected));
  expect(screen.getByRole("status")).toHaveTextContent(
    `${expected.length} of 4 tasks on this page`,
  );
  expect(list).toHaveBeenCalledTimes(callsBeforeFiltering);
});

it("combines status, agent and computer filters and clears an empty result", async () => {
  workspace();
  await screen.findByRole("searchbox", { name: "Search this page" });
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  await selectOption("Status", "active");
  await selectOption("Agent", "claude");
  await selectOption("Computer", windows.id);
  await waitFor(() => expect(visiblePrompts()).toEqual(["Review approval"]));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "unmatched query" } });
  await screen.findByText("No matching tasks");
  expect(screen.queryByRole("list", { name: "Agent tasks" })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
  await waitFor(() => expect(visiblePrompts()).toEqual(sampleTasks.map((item) => item.prompt)));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("All statuses");
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent("All agents");
  expect(screen.getByRole("combobox", { name: "Computer" })).toHaveTextContent("All computers");
});

it.each([
  ["active", ["pending", "running", "waiting", "cancelling"]],
  ["attention", ["waiting"]],
  ["working", ["pending", "running", "cancelling"]],
  ["finished", ["succeeded", "failed", "cancelled", "interrupted", "delivery_failed"]],
  ["errors", ["failed", "interrupted", "delivery_failed"]],
] as const)("includes every relevant task state in the %s filter", async (filter, expected) => {
  const statuses: AgentTask["status"][] = [
    "pending",
    "running",
    "waiting",
    "cancelling",
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
    "delivery_failed",
  ];
  workspace(statuses.map((status) => task(`Task ${status}`, { status })));
  fireEvent.click(await screen.findByRole("button", { name: "Filters" }));
  await screen.findByRole("combobox", { name: "Status" });
  await selectOption("Status", filter);
  await waitFor(() => expect(visiblePrompts()).toEqual(expected.map((item) => `Task ${item}`)));
});

it("keeps cursor pagination available when this page has no matches", async () => {
  const newest = task("Newest task");
  const archived = task("Archive task", { createdAt: "2026-10-23T03:00:00Z" });
  const cursor = `${newest.createdAt}:${newest.id}`;
  const list = vi.fn(async (input: { limit?: number; before?: string }) => {
    if (!input.before) return [newest];
    if (input.before === cursor) return [archived];
    return [];
  });
  workspace([newest], list);
  const search = await screen.findByRole("searchbox", { name: "Search this page" });
  fireEvent.change(search, { target: { value: "archive" } });
  await screen.findByText("No matching tasks");
  const pages = screen.getByRole("navigation", { name: "Task pages" });
  expect(within(pages).getByRole("button", { name: "Newer tasks" })).toBeDisabled();
  fireEvent.click(within(pages).getByRole("button", { name: "Older tasks" }));
  await screen.findByRole("button", { name: /Archive task/ });
  expect(screen.getByRole("searchbox")).toHaveValue("archive");
  expect(list).toHaveBeenCalledWith({ limit: 100, before: cursor }, expect.anything());
  expect(screen.getByRole("button", { name: "Older tasks" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Newer tasks" }));
  await screen.findByText("No matching tasks");
  fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
  await screen.findByRole("button", { name: /Newest task/ });
});

it("ends the loading state after a read failure and recovers with refresh", async () => {
  const list = vi.fn(async (input: { limit?: number; before?: string }) =>
    input.limit === 1 ? [] : sampleTasks,
  );
  list.mockRejectedValueOnce(new Error("private task diagnostic"));
  workspace(sampleTasks, list);
  await screen.findByRole("alert");
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  expect(screen.queryByText("private task diagnostic")).not.toBeInTheDocument();
  const refresh = screen.getByRole("button", { name: "Refresh" });
  expect(refresh).toBeEnabled();
  fireEvent.click(refresh);
  await screen.findByRole("button", { name: /Investigate build/ });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("filters the loaded page by project without creating or refetching tasks", async () => {
  const first = task("Project A work"),
    second = task("Project B work");
  mac.projects = [
    { id: first.projectId, name: "Project A", providers: ["codex"], dirty: false },
    { id: second.projectId, name: "Project B", providers: ["codex"], dirty: false },
  ];
  try {
    const { list } = workspace([first, second]);
    fireEvent.click(await screen.findByRole("button", { name: "Filters" }));
    const previous = list.mock.calls.length;
    await selectOption("Project", first.projectId);
    await waitFor(() => expect(visiblePrompts()).toEqual(["Project A work"]));
    expect(list).toHaveBeenCalledTimes(previous);
    fireEvent.click(screen.getByRole("button", { name: "Show all projects" }));
    await waitFor(() => expect(visiblePrompts()).toEqual(["Project A work", "Project B work"]));
  } finally {
    mac.projects = [];
  }
});

it("resizes the split view with the keyboard, clamps its width and saves the device preference", async () => {
  workspace();
  const separator = await screen.findByRole("separator", { name: "Resize task list and details" });
  fireEvent.keyDown(separator, { key: "End" });
  expect(separator).toHaveAttribute("aria-valuenow", "50");
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(separator).toHaveAttribute("aria-valuenow", "50");
  fireEvent.keyDown(separator, { key: "Home" });
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(separator).toHaveAttribute("aria-valuenow", "32");
  expect(localStorage.getItem("raypx.task-list-width.v1")).toBe("32");
});
