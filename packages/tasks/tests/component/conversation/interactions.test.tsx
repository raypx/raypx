import { mockTaskLayout } from "../../helpers/layout.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskWorkspace } from "@raypx/tasks/client";
import type { TaskClient } from "@raypx/client";

beforeEach(() => {
  // jsdom has no layout; provide dimensions for the real virtualizer.
  mockTaskLayout("list");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());

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
