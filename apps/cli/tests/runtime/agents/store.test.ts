import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentStore, type LocalAgentTask } from "../../../src/runtime/agents/store";
import { AgentRuntime } from "../../../src/runtime/agents";
import { StateStore } from "../../../src/runtime/state";
import type { AgentEvent } from "@raypx/contracts/tasks";

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
