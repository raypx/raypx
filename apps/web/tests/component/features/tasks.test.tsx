import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskWorkspace } from "@raypx/tasks/client";
import type { TaskClient, TaskChange } from "@raypx/client";
import type { TaskHistoryPage } from "@raypx/tasks/model";

beforeEach(() => {
  // jsdom has no layout; provide dimensions for the real virtualizer.
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-task-list") ? 480 : 0;
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(480);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());
it("does not reuse another account's conversation while the next account loads", async () => {
  const task = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Shared task identifier",
    status: "running" as const,
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const page = (text: string): TaskHistoryPage => ({
    task,
    requests: [],
    events: [],
    activity: [
      {
        id: crypto.randomUUID(),
        taskId: task.id,
        kind: "message",
        order: 1,
        revision: 1,
        text,
        status: "complete",
        truncated: false,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    ],
  });
  let finish: (page: TaskHistoryPage) => void = () => {};
  const get = vi
    .fn()
    .mockResolvedValueOnce(page("Account A private reply"))
    .mockImplementationOnce(
      () =>
        new Promise<TaskHistoryPage>((resolve) => {
          finish = resolve;
        }),
    );
  const client = {
    tasks: { list: async (input: { limit?: number }) => (input.limit === 1 ? [] : [task]), get },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
    subscribe: () => () => {},
  } as unknown as TaskClient;
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const accountWorkspace = (accountId: string) => (
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider>
        <TaskWorkspace client={client} scope={{ kind: "remote", namespace: "server", accountId }} />
      </BrowserLanguageProvider>
    </QueryClientProvider>
  );
  const view = render(accountWorkspace("account-a"));
  fireEvent.click(await screen.findByRole("button", { name: /Shared task identifier/ }));
  await screen.findByText("Account A private reply");
  view.rerender(accountWorkspace("account-b"));
  fireEvent.click(await screen.findByRole("button", { name: /Shared task identifier/ }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Account A private reply")).not.toBeInTheDocument();
  await act(async () => finish(page("Account B reply")));
  await screen.findByText("Account B reply");
});

it("merges live activity without refreshing workspace queries and recovers a missing delta base", async () => {
  const task = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Stream task",
    status: "running" as const,
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const entry = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "message" as const,
    order: 1,
    revision: 1,
    text: "Hello",
    status: "streaming" as const,
    truncated: false,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
  let checkpoint = false;
  const get = vi.fn(async (_input: { beforeActivity?: number }) => ({
    task,
    events: [],
    requests: [],
    activity: [{ ...entry, ...(checkpoint ? { text: "Checkpoint", revision: 4 } : {}) }],
  }));
  const list = vi.fn(async (input: { limit?: number }) => (input.limit === 1 ? [] : [task]));
  const devices = vi.fn(async () => []),
    approvals = vi.fn(async () => []);
  const listeners = new Set<(change?: TaskChange) => void>();
  const client = {
    tasks: { list, get },
    devices: { list: devices },
    approvals: { list: approvals },
    subscribe: (listener: (change?: TaskChange) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as TaskClient;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <TaskWorkspace
          client={client}
          scope={{ kind: "remote", namespace: "default", accountId: "stream-account" }}
        />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Stream task/ }));
  await screen.findByText("Hello");
  expect(get).toHaveBeenCalledTimes(1);
  const counts = {
    list: list.mock.calls.length,
    get: get.mock.calls.length,
    devices: devices.mock.calls.length,
    approvals: approvals.mock.calls.length,
  };
  const delta = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "activity_delta" as const,
    entryId: entry.id,
    baseRevision: 1,
    revision: 2,
    append: " world",
    truncated: false,
    updatedAt: task.updatedAt,
  };
  act(() => {
    for (const listener of listeners)
      listener({ type: "events", events: [{ sequence: 1, event: delta }] });
  });
  await screen.findByText("Hello world");
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect({
    list: list.mock.calls.length,
    get: get.mock.calls.length,
    devices: devices.mock.calls.length,
    approvals: approvals.mock.calls.length,
  }).toEqual(counts);
  checkpoint = true;
  act(() => {
    for (const listener of listeners)
      listener({
        type: "events",
        events: [
          {
            sequence: 2,
            event: { ...delta, id: crypto.randomUUID(), baseRevision: 3, revision: 4 },
          },
        ],
      });
  });
  await screen.findByText("Checkpoint");
  expect(get.mock.calls.length).toBe(counts.get + 1);
  expect(devices.mock.calls.length).toBe(counts.devices);
  const latest = {
    ...entry,
    id: crypto.randomUUID(),
    order: 65,
    text: "Newest after hidden period",
  };
  const missing = { ...entry, id: crypto.randomUUID(), order: 2, text: "Recovered middle history" };
  get.mockImplementation(async (input) => ({
    task,
    events: [],
    requests: [],
    activity: input.beforeActivity ? [missing] : [latest],
    ...(input.beforeActivity ? {} : { activityBefore: 65 }),
  }));
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  // The live socket can resume before the bounded HTTP checkpoint returns.
  act(() => {
    for (const listener of listeners)
      listener({
        type: "events",
        events: [
          {
            sequence: 3,
            event: { kind: "activity", id: crypto.randomUUID(), taskId: task.id, entry: latest },
          },
        ],
      });
  });
  await screen.findByText("Newest after hidden period");
  const gap = await screen.findByRole("button", {
    name: "Some messages are missing here. Load the missing history.",
  });
  expect(gap).toBeTruthy();
  const newest = { ...latest, id: crypto.randomUUID(), order: 129, text: "Second hidden period" };
  const secondMissing = {
    ...missing,
    id: crypto.randomUUID(),
    order: 66,
    text: "Second middle history",
  };
  get.mockImplementation(async (input) => ({
    task,
    events: [],
    requests: [],
    activity:
      input.beforeActivity === 65
        ? [missing]
        : input.beforeActivity === 129
          ? [secondMissing]
          : [newest],
    ...(input.beforeActivity ? {} : { activityBefore: 129 }),
  }));
  fireEvent(document, new Event("visibilitychange"));
  await screen.findByText("Second hidden period");
  const gapName = "Some messages are missing here. Load the missing history.";
  expect(screen.getAllByRole("button", { name: gapName })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: gapName })[1]!);
  await screen.findByText("Second middle history");
  await waitFor(() => expect(screen.getAllByRole("button", { name: gapName })).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: gapName }));
  await screen.findByText("Recovered middle history");
  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "Some messages are missing here. Load the missing history.",
      }),
    ).toBeNull(),
  );
  expect(get.mock.calls.some(([input]) => input.beforeActivity === 65)).toBe(true);
});

it.each(["pending", "cancelling", "running"] as const)(
  "shares disabled submission rules with the keyboard while %s",
  async (status) => {
    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      provider: "codex" as const,
      mode: "run" as const,
      prompt: "Input guard",
      status,
      summary: "",
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
    };
    const input = vi.fn(() => new Promise<never>(() => {}));
    const client = {
      tasks: {
        list: async () => [task],
        get: async () => ({ task, events: [], requests: [], activity: [] }),
        input,
      },
      devices: {
        list: async () => [
          {
            id: task.deviceId,
            name: "Test",
            projects: [],
            capabilities: [{ provider: "codex", available: true, inputModes: ["queue", "steer"] }],
          },
        ],
      },
      approvals: { list: async () => [] },
    } as unknown as TaskClient;
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <BrowserLanguageProvider>
          <TaskWorkspace
            client={client}
            scope={{ kind: "remote", namespace: "default", accountId: "input-guard" }}
          />
        </BrowserLanguageProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Input guard/ }));
    const prompt = await screen.findByRole("textbox", { name: "Add an instruction" });
    fireEvent.change(prompt, { target: { value: "Next" } });
    fireEvent.keyDown(prompt, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(prompt, { key: "Enter", metaKey: true });
    fireEvent.submit(prompt.closest("form")!);
    expect(input).toHaveBeenCalledTimes(status === "running" ? 1 : 0);
    expect(
      screen.getByRole("button", { name: status === "running" ? "Sending…" : "Queue next turn" }),
    ).toBeDisabled();
  },
);

async function workspace() {
  const task = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Original task",
    status: "succeeded" as const,
    summary: "Done",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const followUp = vi.fn(async (input: { id: string; prompt: string }) => ({
    ...task,
    ...input,
    parentTaskId: task.id,
  }));
  const client = {
    tasks: {
      list: async () => [task],
      get: async () => ({ task, events: [], requests: [] }),
      followUp,
    },
    devices: { list: async () => [] },
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
  fireEvent.click(await screen.findByRole("button", { name: /Original task/ }));
  const input = await screen.findByRole("textbox", { name: "Follow up in the same session" });
  const submit = () => fireEvent.submit(input.closest("form")!);
  return { followUp, input, submit };
}

it("creates a new task when the same follow-up text is submitted again after success", async () => {
  const { followUp, input, submit } = await workspace();
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await waitFor(() => expect(input).toHaveValue(""));
  const firstId = followUp.mock.calls[0]![0].id;
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await waitFor(() => expect(followUp).toHaveBeenCalledTimes(2));
  expect(followUp.mock.calls[1]![0].id).not.toBe(firstId);
});

it("keeps the follow-up ID for an ambiguous retry and clears it after confirmed success", async () => {
  const { followUp, input, submit } = await workspace();
  followUp.mockRejectedValueOnce(new Error("Response lost"));
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await screen.findByRole("alert");
  const firstId = followUp.mock.calls[0]![0].id;
  submit();
  await waitFor(() => expect(input).toHaveValue(""));
  expect(followUp.mock.calls[1]![0].id).toBe(firstId);
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await waitFor(() => expect(followUp).toHaveBeenCalledTimes(3));
  expect(followUp.mock.calls[2]![0].id).not.toBe(firstId);
});

it("answers single and multiple choice questions with labelled shadcn controls", async () => {
  const taskId = crypto.randomUUID();
  const request = {
    id: crypto.randomUUID(),
    taskId,
    kind: "question" as const,
    title: "Choose",
    body: "",
    questions: [
      {
        id: "one",
        text: "Pick one",
        multiSelect: false,
        options: [
          { label: "Alpha", description: "" },
          { label: "Beta", description: "" },
        ],
      },
      {
        id: "many",
        text: "Pick many",
        multiSelect: true,
        options: [
          { label: "Gamma", description: "" },
          { label: "Delta", description: "" },
        ],
      },
    ],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: "pending" as const,
    decision: null,
  };
  const decide = vi.fn(async () => ({ ...request, status: "decided" }));
  const client = {
    tasks: { list: async () => [] },
    devices: { list: async () => [] },
    approvals: { list: async () => [request], decide },
  } as unknown as TaskClient;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <TaskWorkspace
          client={client}
          scope={{ kind: "remote", namespace: "default", accountId: "account" }}
          view="approvals"
        />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("radio", { name: "Beta" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Gamma" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Delta" }));
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await waitFor(() =>
    expect(decide).toHaveBeenCalledWith(
      {
        id: request.id,
        decision: { type: "answer", answers: { one: ["Beta"], many: ["Gamma", "Delta"] } },
      },
      expect.anything(),
    ),
  );
});

it("opens a linked task outside the loaded list without creating or resending work", async () => {
  const task = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Linked task outside this page",
    status: "running" as const,
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const create = vi.fn(),
    followUp = vi.fn();
  const get = vi.fn(async () => ({
    task,
    events: [],
    requests: [],
    activity: [
      {
        id: crypto.randomUUID(),
        taskId: task.id,
        order: 1,
        revision: 1,
        kind: "message" as const,
        text: "Linked task reply",
        status: "complete" as const,
        truncated: false,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    ],
  }));
  const client = {
    tasks: { list: async () => [], get, create, followUp },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
    subscribe: () => () => {},
  } as unknown as TaskClient;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <TaskWorkspace
          client={client}
          scope={{ kind: "remote", namespace: "default", accountId: "account" }}
          initialTaskId={task.id}
        />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Linked task reply")).toBeTruthy();
  expect(get).toHaveBeenCalledWith({ id: task.id, after: 0 }, expect.anything());
  expect(create).not.toHaveBeenCalled();
  expect(followUp).not.toHaveBeenCalled();
});
