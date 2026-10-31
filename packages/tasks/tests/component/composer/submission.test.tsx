import { mockTaskLayout } from "../../helpers/layout.js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskWorkspace } from "@raypx/tasks/client";
import type { AgentTask, SyncDevice } from "@raypx/tasks";
import type { TaskWorkspacePort } from "@raypx/tasks/model";
import { createTaskClient } from "../../helpers/client.js";
import { selectOption } from "../../helpers/select.js";

beforeEach(() => {
  mockTaskLayout("all");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());

async function submission() {
  const projectId = crypto.randomUUID();
  const device: SyncDevice = {
    id: crypto.randomUUID(),
    name: "Test Mac",
    platform: "darwin",
    appVersion: "1.0.0",
    epoch: 1,
    revoked: false,
    lastSeenAt: null,
    online: true,
    projects: [{ id: projectId, name: "Test project", providers: ["claude"], dirty: false }],
    capabilities: [
      {
        provider: "claude",
        available: true,
        version: "test",
        reason: "ready",
        inputModes: ["steer" as const, "queue" as const],
      },
    ],
  };
  let accepted: AgentTask;
  let projected: AgentTask[] = [];
  let rejectReceipt: (error: Error) => void = () => {};
  const listeners = new Set<() => void>();
  const create = vi.fn(
    (input: Parameters<TaskWorkspacePort["tasks"]["create"]>[0]) =>
      new Promise<AgentTask>((_resolve, reject) => {
        rejectReceipt = reject;
        accepted = {
          ...input,
          status: "waiting",
          summary: "",
          parentTaskId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
  );
  const get = vi.fn(async () => ({
    task: accepted,
    events: [],
    activity: [],
    requests: [
      {
        id: crypto.randomUUID(),
        taskId: accepted.id,
        kind: "plan" as const,
        title: "Review the plan",
        body: "Create the requested file",
        questions: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        status: "pending" as const,
        decision: null,
      },
    ],
  }));
  const client = createTaskClient({
    tasks: {
      create,
      get,
      list: async (input: { limit?: number }) => (input.limit === 1 ? [] : projected),
    },
    devices: { list: async () => [device] },
    approvals: { list: async () => [] },
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
  });
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
  fireEvent.click(await screen.findByRole("button", { name: "New task" }));
  await selectOption("Computer", device.id);
  await selectOption("Project", projectId);
  const prompt = screen.getByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(prompt, { target: { value: "Create an acceptance file" } });
  fireEvent.submit(prompt.closest("form")!);
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  return {
    create,
    get,
    fail: () => act(async () => rejectReceipt(new Error("Relay receipt lost"))),
    publish: (sameTask = true) =>
      act(async () => {
        projected = [{ ...accepted, ...(sameTask ? {} : { id: crypto.randomUUID() }) }];
        for (const notify of listeners) notify();
      }),
  };
}

it.each(["before", "after"])(
  "opens the accepted task when its projection arrives %s the relay receipt fails",
  async (order) => {
    const fixture = await submission();
    if (order === "before") await fixture.publish();
    await fixture.fail();
    if (order === "after") {
      await screen.findByRole("alert");
      await fixture.publish();
    }
    await screen.findByRole("button", { name: "Approve plan" });
    expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue("");
    expect(fixture.create).toHaveBeenCalledTimes(1);
  },
);

it("keeps an ambiguous submission open when another task occupies the project", async () => {
  const fixture = await submission();
  await fixture.fail();
  await fixture.publish(false);
  await screen.findByText("Another task is using this project. Wait for it to finish.");
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toBeVisible();
  expect(fixture.get).not.toHaveBeenCalled();
  expect(fixture.create).toHaveBeenCalledTimes(1);
});
