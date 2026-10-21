import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentStore, desktopBinding, type LocalAgentTask } from "../../../src/runtime/agents/store";
import { AgentRuntime } from "../../../src/runtime/agents";
import { StateStore } from "../../../src/runtime/state";
import { taskSchema, type AgentEvent } from "@raypx/contracts/tasks";

afterEach(() => vi.restoreAllMocks());

it("rolls back the task transition when its outbox write fails and preserves a committed result across restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-agent-transition-"));
  const state = new StateStore(directory);
  let store: AgentStore | undefined = new AgentStore(directory);
  let runtime: AgentRuntime | undefined;
  try {
    const local: LocalAgentTask = {
      binding: "binding",
      sessionId: "session",
      task: {
        id: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: "Task",
        status: "running",
        summary: "",
        parentTaskId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    store.put(local);
    const completed: LocalAgentTask = {
      ...local,
      task: { ...local.task, status: "succeeded", summary: "Durable result" },
    };
    const event: AgentEvent = {
      id: crypto.randomUUID(),
      taskId: local.task.id,
      kind: "status",
      status: "succeeded",
      summary: "Durable result",
    };
    const insert = vi.spyOn(store, "event").mockImplementationOnce(() => {
      throw new Error("Interrupted write");
    });
    expect(() => store!.transition(completed, event)).toThrow("Interrupted write");
    expect(store.get(local.task.id)?.task.status).toBe("running");
    expect(store.events(local.binding)).toEqual([]);
    insert.mockRestore();
    store.transition(completed, event);
    store.close();
    store = new AgentStore(directory);
    expect(store.get(local.task.id)?.task).toMatchObject({
      status: "succeeded",
      summary: "Durable result",
    });
    expect(store.events(local.binding)).toEqual([event]);
    store.close();
    store = undefined;
    runtime = new AgentRuntime(state, () => {});
    expect(runtime.events(local.binding).events).toEqual([event]);
    runtime.ack(local.binding, [event.id]);
    expect(runtime.events(local.binding).events).toEqual([]);
  } finally {
    await runtime?.close();
    store?.close();
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it("keeps Desktop identity and task history across restart without creating a relay outbox", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-local-agent-")),
    state = new StateStore(directory),
    binding = desktopBinding("account-a");
  const store = new AgentStore(directory),
    deviceId = store.deviceId(binding);
  const task: LocalAgentTask = {
    binding,
    sessionId: null,
    task: {
      id: crypto.randomUUID(),
      deviceId,
      projectId: crypto.randomUUID(),
      provider: "codex",
      mode: "run",
      prompt: "Private local task",
      status: "running",
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  store.put(task);
  store.close();
  const runtime = new AgentRuntime(state, () => {});
  try {
    expect(runtime.localTasks("account-a", 100)[0]).toMatchObject({
      id: task.task.id,
      deviceId,
      status: "interrupted",
    });
    expect(runtime.localTasks("account-b", 100)).toEqual([]);
    expect(runtime.events(binding).events).toEqual([]);
    expect(runtime.replay("remote-binding", 0).events).toEqual([]);
    const reopened = new AgentStore(directory);
    try {
      expect(reopened.deviceId(binding)).toBe(deviceId);
      expect(reopened.deviceId(desktopBinding("account-b"))).not.toBe(deviceId);
      expect(reopened.taskEvents(binding, task.task.id, 0).at(-1)?.event).toMatchObject({
        kind: "status",
        status: "interrupted",
      });
    } finally {
      reopened.close();
    }
  } finally {
    await runtime.close();
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it("paginates every local task across byte and record limits, including equal timestamps", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-local-pages-")),
    state = new StateStore(directory),
    runtime = new AgentRuntime(state, () => {}),
    store = new AgentStore(directory),
    binding = desktopBinding("account-a"),
    deviceId = store.deviceId(binding);
  try {
    const tasks = Array.from({ length: 106 }, (_, index) =>
      taskSchema.parse({
        id: crypto.randomUUID(),
        deviceId,
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: index < 3 ? "中".repeat(32_000) : `Task ${index}`,
        summary: index < 3 ? "文".repeat(32_000) : "Done",
        status: "succeeded",
        parentTaskId: null,
        createdAt: new Date(1_700_000_000_000).toISOString(),
        updatedAt: new Date(1_700_000_000_000).toISOString(),
      }),
    );
    for (const task of tasks) store.put({ task, binding, sessionId: null });
    const ids: string[] = [];
    let before: string | undefined;
    for (let pageNumber = 0; pageNumber <= tasks.length; pageNumber++) {
      const page = runtime.localTasks("account-a", 100, before);
      if (!page.length) break;
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(257 * 1024);
      ids.push(...page.map((task) => task.id));
      const last = page.at(-1)!;
      before = `${last.createdAt}:${last.id}`;
    }
    expect(ids).toEqual(
      tasks
        .map((task) => task.id)
        .sort()
        .reverse(),
    );
    expect(runtime.localTasks("account-b", 100)).toEqual([]);
  } finally {
    store.close();
    await runtime.close();
    state.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it("retains local activity across relay compaction and restart without creating a cloud outbox", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-local-history-")),
    binding = desktopBinding("account-a"),
    oldTaskId = crypto.randomUUID(),
    nextTaskId = crypto.randomUUID();
  let store = new AgentStore(directory, 8);
  const event = (taskId: string): AgentEvent => ({
    id: crypto.randomUUID(),
    taskId,
    kind: "status",
    status: "succeeded",
    summary: "Saved activity",
  });
  try {
    const original = event(oldTaskId);
    store.event(binding, original);
    store.event("remote-binding", event(oldTaskId));
    const remoteStart = store.sequence("remote-binding");
    for (let index = 0; index < 8; index++) {
      store.event(binding, event(nextTaskId));
      store.event("remote-binding", event(nextTaskId));
    }
    store.checkpoint("remote-binding", store.sequence("remote-binding"));
    store.close();
    store = new AgentStore(directory, 8);
    expect(store.taskEvents(binding, oldTaskId, 0).map((item) => item.event)).toEqual([original]);
    expect(store.taskEvents(desktopBinding("account-b"), oldTaskId, 0)).toEqual([]);
    expect(store.events(binding)).toEqual([]);
    expect(store.events("remote-binding")).toEqual([]);
    expect(store.taskEvents("remote-binding", oldTaskId, 0)).toEqual([]);
    expect(store.replay("remote-binding", 0).floor).toBeGreaterThan(remoteStart);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
