import { mockTaskLayout } from "../../helpers/layout.js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { TaskWorkspace } from "@raypx/tasks/client";
import type { AgentTask } from "@raypx/tasks";
import type { TaskHistoryPage, TaskWorkspacePort } from "@raypx/tasks/model";
import type { TaskChange } from "@raypx/contracts/tasks";

beforeEach(() => {
  mockTaskLayout("all");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());

function historyFixture() {
  const now = new Date().toISOString();
  const tasks: AgentTask[] = [1, 2].map((index) => ({
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex",
    mode: "run",
    prompt: `History task ${index}`,
    status: "running",
    summary: "",
    parentTaskId: null,
    createdAt: now,
    updatedAt: now,
  }));
  const historyPage = (task: AgentTask, text: string, older = false): TaskHistoryPage => ({
    task,
    events: [],
    requests: [],
    activity: [
      {
        id: `${task.id}:${older ? 1 : 100}`,
        taskId: task.id,
        order: older ? 1 : 100,
        revision: 1,
        kind: "message",
        text,
        status: "complete",
        truncated: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...(older ? {} : { activityBefore: 100 }),
  });
  let owner = "account-a";
  const latest = new Map<string, TaskHistoryPage>();
  const listeners = new Set<(change?: TaskChange) => void>();
  const pending: {
    signal: AbortSignal;
    resolve(page: TaskHistoryPage): void;
    reject(error: Error): void;
  }[] = [];
  const get = vi.fn(
    (input: { id: string; beforeActivity?: number }, options?: { signal?: AbortSignal }) => {
      const task = tasks.find((item) => item.id === input.id)!;
      if (input.beforeActivity !== undefined)
        return new Promise<TaskHistoryPage>((resolve, reject) => {
          pending.push({ signal: options!.signal!, resolve, reject });
        });
      return Promise.resolve(latest.get(task.id) ?? historyPage(task, `${owner}: ${task.prompt}`));
    },
  );
  const client = {
    tasks: { list: async (input: { limit?: number }) => (input.limit === 1 ? [] : tasks), get },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
    subscribe: (listener: (change?: TaskChange) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as TaskWorkspacePort;
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (accountId = owner) => (
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider>
        <TaskWorkspace client={client} scope={{ kind: "remote", namespace: "server", accountId }} />
      </BrowserLanguageProvider>
    </QueryClientProvider>
  );
  return {
    tasks,
    get,
    pending,
    element,
    historyPage,
    latest,
    publish(change?: TaskChange) {
      for (const listener of listeners) listener(change);
    },
    changeOwner(value: string) {
      owner = value;
    },
  };
}

it.each(["owner", "task", "unmount"] as const)(
  "aborts a paging read on %s changes and ignores a transport's late settlement",
  async (transition) => {
    const fixture = historyFixture();
    const view = render(fixture.element());
    fireEvent.click(await screen.findByRole("button", { name: /History task 1/ }));
    await screen.findByText("account-a: History task 1");
    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    await waitFor(() => expect(fixture.pending).toHaveLength(1));
    const request = fixture.pending[0]!;
    if (transition === "owner") {
      fixture.changeOwner("account-b");
      view.rerender(fixture.element());
      fireEvent.click(await screen.findByRole("button", { name: /History task 1/ }));
      await screen.findByText("account-b: History task 1");
    } else if (transition === "task") {
      fireEvent.click(screen.getByRole("button", { name: /History task 2/ }));
      await screen.findByText("account-a: History task 2");
    } else view.unmount();
    expect(request.signal.aborted).toBe(true);
    const calls = fixture.get.mock.calls.length;
    await act(async () => {
      if (transition === "task") request.reject(new Error("Late old-task failure"));
      else
        request.resolve(fixture.historyPage(fixture.tasks[0]!, "Discarded private history", true));
    });
    expect(fixture.get).toHaveBeenCalledTimes(calls);
    expect(screen.queryByText("Discarded private history")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);

it("releases timed-out pagination even when the adapter ignores abort, then permits an explicit retry", async () => {
  const deadline = new AbortController();
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  let pageTimeouts = 0;
  vi.spyOn(AbortSignal, "timeout").mockImplementation((delay) =>
    delay === 15_000 && pageTimeouts++ === 0 ? deadline.signal : timeout(delay),
  );
  const fixture = historyFixture();
  render(fixture.element());
  fireEvent.click(await screen.findByRole("button", { name: /History task 1/ }));
  await screen.findByText("account-a: History task 1");
  fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
  await waitFor(() => expect(fixture.pending).toHaveLength(1));
  await act(async () => deadline.abort(new DOMException("Page deadline", "TimeoutError")));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Load earlier messages" })).toBeEnabled();
  const calls = fixture.get.mock.calls.length;
  await act(async () =>
    fixture.pending[0]!.resolve(
      fixture.historyPage(fixture.tasks[0]!, "Discarded timed-out history", true),
    ),
  );
  expect(fixture.get).toHaveBeenCalledTimes(calls);
  expect(screen.queryByText("Discarded timed-out history")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
  await waitFor(() => expect(fixture.pending).toHaveLength(2));
  await act(async () =>
    fixture.pending[1]!.resolve(fixture.historyPage(fixture.tasks[0]!, "Recovered on retry", true)),
  );
  await screen.findByText("Recovered on retry");
});

it.each(["reset", "visibility", "missing-baseline"] as const)(
  "preserves complete live coverage but freezes it for %s recovery before a newer entry arrives",
  async (recovery) => {
    const fixture = historyFixture();
    render(fixture.element());
    fireEvent.click(await screen.findByRole("button", { name: /History task 1/ }));
    await screen.findByText("account-a: History task 1");
    const task = fixture.tasks[0]!;
    const entries = Array.from({ length: 70 }, (_, index) => ({
      ...fixture.historyPage(task, `Continuous ${index}`).activity![0]!,
      id: crypto.randomUUID(),
      order: 1000 + index * 10,
    }));
    act(() =>
      fixture.publish({
        type: "events",
        events: entries.map((entry, index) => ({
          sequence: index + 1,
          event: { kind: "activity", id: crypto.randomUUID(), taskId: task.id, entry },
        })),
      }),
    );
    await screen.findByText("Continuous 69");
    fixture.latest.set(task.id, {
      ...fixture.historyPage(task, "unused"),
      activity: entries.slice(-64),
      activityBefore: entries[6]!.order,
    });
    const reads = fixture.get.mock.calls.length;
    act(() => fixture.publish({ type: "reset" }));
    await waitFor(() => expect(fixture.get.mock.calls.length).toBeGreaterThan(reads));
    const gapName = "Some messages are missing here. Load the missing history.";
    expect(screen.queryByRole("button", { name: gapName })).not.toBeInTheDocument();
    const recovered = Array.from({ length: 64 }, (_, index) => ({
      ...fixture.historyPage(task, `Recovered checkpoint ${index}`).activity![0]!,
      id: crypto.randomUUID(),
      order: 5000 + index * 10,
    }));
    fixture.latest.set(task.id, {
      ...fixture.historyPage(task, "unused"),
      activity: recovered,
      activityBefore: recovered[0]!.order,
    });
    if (recovery === "visibility") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      fireEvent(document, new Event("visibilitychange"));
      vi.spyOn(document, "hidden", "get").mockReturnValue(false);
      fireEvent(document, new Event("visibilitychange"));
    } else
      act(() =>
        fixture.publish(
          recovery === "reset"
            ? { type: "reset" }
            : {
                type: "events",
                events: [
                  {
                    sequence: 100,
                    event: {
                      kind: "activity_delta",
                      id: crypto.randomUUID(),
                      taskId: task.id,
                      entryId: crypto.randomUUID(),
                      baseRevision: 1,
                      revision: 2,
                      append: "Lost baseline",
                      updatedAt: task.updatedAt,
                      truncated: false,
                    },
                  },
                ],
              },
        ),
      );
    act(() =>
      fixture.publish({
        type: "events",
        events: [
          {
            sequence: 101,
            event: {
              kind: "activity",
              id: crypto.randomUUID(),
              taskId: task.id,
              entry: recovered.at(-1)!,
            },
          },
        ],
      }),
    );
    await screen.findByText("Recovered checkpoint 63");
    fireEvent.click(screen.getByRole("button", { name: "Show all loaded messages" }));
    await screen.findByRole("button", { name: gapName });
  },
);
