import { BrowserLanguageProvider } from "../../../tests/i18n.js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { AgentTask, TaskActivity, TaskInput } from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import type { TaskWorkspacePort } from "../../model/port.js";
import { type WorkspaceScope, workspaceScopeKey } from "../../model/scope.js";
import { createTaskDraft, MAX_TASK_DRAFTS, readTaskDrafts } from "../../model/drafts.js";
import { TaskDetail } from "../task-detail.js";
import { TaskComposer } from "../task-composer.js";
import { createRef } from "react";
import { createTaskClient } from "../../../tests/helpers/client.js";
import { mockTaskLayout } from "../../../tests/helpers/layout.js";

beforeEach(() => {
  mockTaskLayout("all");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());

const scope: WorkspaceScope = { kind: "remote", namespace: "server", accountId: "account-a" };
const storeKey = JSON.stringify(["raypx.task-session-editors.v1", workspaceScopeKey(scope)]);
const labels = { followUp: "Follow up in the same session", input: "Add an instruction" };

function fixture(kind: "followUp" | "input" = "followUp") {
  const deviceId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const tasks: AgentTask[] = [0, 1, 2].map((index) => ({
    id: crypto.randomUUID(),
    deviceId,
    projectId: index === 2 ? crypto.randomUUID() : projectId,
    provider: "codex",
    mode: "run",
    prompt: `Session ${index}`,
    status: kind === "input" ? "running" : "succeeded",
    summary: "Result",
    parentTaskId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  }));
  const activity: TaskActivity[] = [];
  const devices: SyncDevice[] = [
    {
      id: deviceId,
      name: "Computer",
      platform: "darwin",
      appVersion: "test",
      epoch: 1,
      revoked: false,
      online: true,
      lastSeenAt: null,
      projects: tasks.map((task) => ({
        id: task.projectId,
        name: task.projectId,
        providers: ["codex"],
        dirty: false,
      })),
      capabilities: [
        {
          provider: "codex",
          available: true,
          reason: "ready",
          version: "test",
          inputModes: ["queue", "steer"],
          definition: {
            version: 1,
            runtime: "process",
            modes: ["run", "plan"],
            approvals: true,
            modelSelection: false,
          },
        },
      ],
    },
  ];
  const followUp = vi.fn(async (input: Parameters<TaskWorkspacePort["tasks"]["followUp"]>[0]) => ({
    ...tasks[0]!,
    ...input,
  }));
  const input = vi.fn(
    async (command: Parameters<TaskWorkspacePort["tasks"]["input"]>[0]): Promise<TaskInput> => ({
      ...command,
      kind: "input",
      text: command.prompt,
      status: "queued",
      order: 1,
      revision: 1,
      createdAt: tasks[0]!.createdAt,
      updatedAt: tasks[0]!.updatedAt,
    }),
  );
  const listeners = new Set<() => void>();
  const client = createTaskClient({
    tasks: {
      get: async ({ id }) => ({
        task: tasks.find((task) => task.id === id)!,
        activity,
        events: [],
        requests: [],
      }),
      followUp,
      input,
    },
    subscribe: (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
  });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onFollowUp = vi.fn();
  const element = (index = 0, owner = scope) => (
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider>
        <TaskDetail
          client={client}
          id={tasks[index]!.id}
          devices={devices}
          scope={owner}
          onChanged={() => {}}
          onFollowUp={onFollowUp}
        />
      </BrowserLanguageProvider>
    </QueryClientProvider>
  );
  return {
    tasks,
    activity,
    devices,
    client,
    followUp,
    input,
    onFollowUp,
    element,
    publish: () =>
      act(async () => {
        for (const notify of listeners) notify();
      }),
  };
}

it.each(["followUp", "input"] as const)(
  "restores %s text across sessions/projects while isolating owners and origins",
  async (kind) => {
    const f = fixture(kind);
    const view = render(f.element());
    fireEvent.change(await screen.findByRole("textbox", { name: labels[kind] }), {
      target: { value: "Private unfinished instruction" },
    });
    for (const target of [1, 2]) {
      view.rerender(f.element(target));
      const field = await screen.findByRole("textbox", { name: labels[kind] });
      expect(field).toHaveValue("");
      fireEvent.change(field, { target: { value: `Other project/session ${target}` } });
    }
    view.rerender(f.element());
    expect(await screen.findByRole("textbox", { name: labels[kind] })).toHaveValue(
      "Private unfinished instruction",
    );
    for (const owner of [
      { ...scope, accountId: "account-b" },
      { ...scope, namespace: "another-server" },
      { kind: "device", namespace: "server", workspaceId: "account-a" } as const,
    ]) {
      view.rerender(f.element(0, owner));
      expect(await screen.findByRole("textbox", { name: labels[kind] })).toHaveValue("");
    }
    view.rerender(f.element());
    expect(await screen.findByRole("textbox", { name: labels[kind] })).toHaveValue(
      "Private unfinished instruction",
    );
    expect(f.followUp).not.toHaveBeenCalled();
    expect(f.input).not.toHaveBeenCalled();
  },
);

it.each(["followUp", "input"] as const)(
  "a late %s success preserves replacement text after switching away and back",
  async (kind) => {
    const f = fixture(kind);
    let finish = () => {};
    if (kind === "followUp")
      f.followUp.mockImplementationOnce(
        (command) =>
          new Promise((resolve) => {
            finish = () => resolve({ ...f.tasks[0]!, ...command });
          }),
      );
    else
      f.input.mockImplementationOnce(
        (command) =>
          new Promise((resolve) => {
            finish = () =>
              resolve({
                ...command,
                kind: "input",
                text: command.prompt,
                status: "queued",
                order: 1,
                revision: 1,
                createdAt: f.tasks[0]!.createdAt,
                updatedAt: f.tasks[0]!.updatedAt,
              });
          }),
      );
    const view = render(f.element());
    const field = await screen.findByRole("textbox", { name: labels[kind] });
    fireEvent.change(field, { target: { value: "First instruction" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(kind === "followUp" ? f.followUp : f.input).toHaveBeenCalledOnce();
    view.rerender(f.element(1));
    fireEvent.change(await screen.findByRole("textbox", { name: labels[kind] }), {
      target: { value: "Other session text" },
    });
    view.rerender(f.element());
    fireEvent.change(await screen.findByRole("textbox", { name: labels[kind] }), {
      target: { value: "Replacement instruction" },
    });
    await act(async () => finish());
    expect(screen.getByRole("textbox", { name: labels[kind] })).toHaveValue(
      "Replacement instruction",
    );
    expect(f.onFollowUp).not.toHaveBeenCalled();
    view.rerender(f.element(1));
    expect(await screen.findByRole("textbox", { name: labels[kind] })).toHaveValue(
      "Other session text",
    );
    view.rerender(f.element());
    expect(await screen.findByRole("textbox", { name: labels[kind] })).toHaveValue(
      "Replacement instruction",
    );
  },
);

it("keeps a frozen follow-up receipt across a failed send and remount, then clears only after success", async () => {
  const f = fixture();
  f.followUp.mockRejectedValueOnce(new Error("Lost receipt"));
  const view = render(f.element());
  const field = await screen.findByRole("textbox", { name: labels.followUp });
  fireEvent.change(field, { target: { value: "Retry the same instruction" } });
  fireEvent.keyDown(field, { key: "Enter", metaKey: true });
  await screen.findByRole("alert");
  expect(field).toHaveValue("Retry the same instruction");
  const first = f.followUp.mock.calls[0]![0];
  view.rerender(f.element(1));
  await screen.findByRole("textbox", { name: labels.followUp });
  view.rerender(f.element());
  const restored = await screen.findByRole("textbox", { name: labels.followUp });
  expect(restored).toHaveValue("Retry the same instruction");
  fireEvent.keyDown(restored, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(restored).toHaveValue(""));
  expect(f.followUp.mock.calls[1]![0]).toEqual(first);
  expect(readTaskDrafts(localStorage.getItem(storeKey))).toEqual([]);
});

it("recovers an accepted instruction from its authoritative activity after remount without resending", async () => {
  const f = fixture("input");
  f.input.mockRejectedValueOnce(new Error("Lost receipt"));
  const view = render(f.element());
  const field = await screen.findByRole("textbox", { name: labels.input });
  fireEvent.change(field, { target: { value: "Already accepted" } });
  fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
  await screen.findByRole("alert");
  const command = f.input.mock.calls[0]![0];
  view.rerender(f.element(1));
  await screen.findByRole("textbox", { name: labels.input });
  f.activity.push({
    ...command,
    kind: "input",
    text: command.prompt,
    status: "queued",
    order: 1,
    revision: 1,
    createdAt: f.tasks[0]!.createdAt,
    updatedAt: f.tasks[0]!.updatedAt,
  });
  view.rerender(f.element());
  await f.publish();
  await waitFor(() => expect(screen.getByRole("textbox", { name: labels.input })).toHaveValue(""));
  expect(f.input).toHaveBeenCalledOnce();
});

it("retains current text when session storage is full or unwritable without evicting another draft", async () => {
  const f = fixture();
  const drafts = Array.from({ length: MAX_TASK_DRAFTS }, (_, index) =>
    createTaskDraft(
      {
        deviceId: f.tasks[0]!.deviceId,
        projectId: f.tasks[0]!.projectId,
        provider: "codex",
        mode: "run",
        prompt: `Keep ${index}`,
      },
      `existing-${index}`,
    ),
  );
  localStorage.setItem(storeKey, JSON.stringify(drafts));
  render(f.element());
  const field = await screen.findByRole("textbox", { name: labels.followUp });
  fireEvent.change(field, { target: { value: "Keep my current text" } });
  expect(field).toHaveValue("Keep my current text");
  await screen.findByText("You have 20 drafts. Delete one before saving a new draft.");
  expect(readTaskDrafts(localStorage.getItem(storeKey))).toEqual(drafts);
  localStorage.removeItem(storeKey);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  fireEvent.change(field, { target: { value: "Still editable" } });
  expect(field).toHaveValue("Still editable");
  await screen.findByText(
    "Unable to read or save drafts on this device. Your current text is still in the editor.",
  );
});

it("keeps leading whitespace in the current editor without storing a blank draft", async () => {
  const f = fixture();
  render(f.element());
  const field = await screen.findByRole("textbox", { name: labels.followUp });
  fireEvent.change(field, { target: { value: " \n" } });
  expect(field).toHaveValue(" \n");
  expect(readTaskDrafts(localStorage.getItem(storeKey))).toEqual([]);
});

it("does not revive an older saved draft when editing and cleanup writes fail after a confirmed send", async () => {
  const f = fixture();
  render(f.element());
  const field = await screen.findByRole("textbox", { name: labels.followUp });
  fireEvent.change(field, { target: { value: "Older saved text" } });
  const older = localStorage.getItem(storeKey);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Write failed");
  });
  fireEvent.change(field, { target: { value: "New instruction" } });
  fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(f.followUp).toHaveBeenCalledOnce());
  await waitFor(() => expect(field).toHaveValue(""));
  await screen.findByText(
    "Session sent, but the saved draft could not be removed. Delete it before sending it again.",
  );
  expect(localStorage.getItem(storeKey)).toBe(older);
});

it.each(["followUp", "input"] as const)(
  "does not send %s during IME composition or the legacy 229 confirmation event",
  async (kind) => {
    const f = fixture(kind);
    render(f.element());
    const field = await screen.findByRole("textbox", { name: labels[kind] });
    fireEvent.change(field, { target: { value: "中文指令" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true, isComposing: true });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true, keyCode: 229 });
    expect(f.followUp).not.toHaveBeenCalled();
    expect(f.input).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
    await waitFor(() => expect(kind === "followUp" ? f.followUp : f.input).toHaveBeenCalledOnce());
  },
);

it("keeps the mounted live conversation and full-text reading mode when the task finishes", async () => {
  const f = fixture("input");
  render(f.element());
  const region = await screen.findByRole("region", { name: "Conversation" });
  fireEvent.click(screen.getByRole("button", { name: "Show all loaded messages" }));
  vi.spyOn(region, "scrollHeight", "get").mockReturnValue(2000);
  region.scrollTop = 123;
  fireEvent.scroll(region);
  f.tasks[0] = { ...f.tasks[0]!, status: "succeeded", summary: "Finished outcome" };
  await f.publish();
  await screen.findByText("Finished outcome");
  expect(screen.getByRole("region", { name: "Result" })).toHaveTextContent("Finished outcome");
  expect(screen.getByRole("region", { name: "Conversation" })).toBe(region);
  expect(region).toHaveAttribute("data-conversation-mode", "full");
  expect(screen.getByRole("button", { name: "View full conversation" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(region.scrollTop).toBe(123);
});

it("opens an already finished session with its result visible and its conversation collapsed", async () => {
  const f = fixture();
  render(f.element());
  await screen.findByRole("textbox", { name: labels.followUp });
  expect(screen.getByRole("region", { name: "Result" })).toBeVisible();
  expect(screen.getByRole("button", { name: "View full conversation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.queryByRole("region", { name: "Conversation" })).not.toBeInTheDocument();
});

it("shows the selected model and blocked-recovery explanation once", async () => {
  const f = fixture();
  const model = { provider: "provider", model: "model", connectionId: "a".repeat(64) };
  f.tasks[0] = { ...f.tasks[0]!, model };
  f.client.tasks.get = async () => ({
    task: f.tasks[0]!,
    activity: [],
    events: [],
    requests: [],
    continuation: { revision: 1, model, blocked: true },
  });
  render(f.element());
  await screen.findByRole("textbox", { name: labels.followUp });
  expect(screen.getAllByText("provider · model")).toHaveLength(1);
  expect(
    screen.getAllByText(
      "This session cannot continue. Inspect unresolved operations, then start a new session.",
    ),
  ).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Send session" })).toBeDisabled();
});

it.each(["ctrlKey", "metaKey"] as const)(
  "submits a new session with %s+Enter only after IME composition ends",
  async (modifier) => {
    const f = fixture();
    const create = vi.fn(async (command: Parameters<TaskWorkspacePort["tasks"]["create"]>[0]) => ({
      ...f.tasks[0]!,
      ...command,
    }));
    render(
      <BrowserLanguageProvider>
        <TaskComposer
          client={{ ...f.client, tasks: { ...f.client.tasks, create } }}
          devices={f.devices}
          tasks={[]}
          local={false}
          draftKey="shortcut-fixture"
          fixedDeviceId={f.tasks[0]!.deviceId}
          fixedProjectId={f.tasks[0]!.projectId}
          initialDraft={{ prompt: "", provider: "codex", mode: "run" }}
          editorOpen
          optionsOpen={false}
          onOptionsOpenChange={() => {}}
          onCreated={() => {}}
          promptRef={createRef<HTMLTextAreaElement>()}
        />
      </BrowserLanguageProvider>,
    );
    const field = await screen.findByRole("textbox", { name: "What should the agent do?" });
    fireEvent.change(field, { target: { value: "输入完成后发送" } });
    fireEvent.keyDown(field, { key: "Enter", [modifier]: true, isComposing: true });
    fireEvent.keyDown(field, { key: "Enter", [modifier]: true, keyCode: 229 });
    expect(create).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", [modifier]: true });
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
  },
);
