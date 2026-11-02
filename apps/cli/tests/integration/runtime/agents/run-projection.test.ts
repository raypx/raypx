import { expect, it } from "vite-plus/test";
import type { HumanRequest } from "@raypx/core/tasks";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { localResults } from "@raypx/contracts/local-client";
import { agentFixtures } from "../../../helpers/agents";
import { AgentStore } from "../../../../src/runtime/agents/store";
import { desktopBinding } from "../../../../src/runtime/agents/model";

const { host } = agentFixtures();

it.each([
  ["pending", "queued"],
  ["running", "running"],
  ["cancelling", "cancelling"],
  ["succeeded", "succeeded"],
  ["failed", "failed"],
  ["delivery_failed", "failed"],
  ["cancelled", "cancelled"],
  ["interrupted", "interrupted"],
] as const)(
  "inspects a persisted %s task as a %s Run without changing storage",
  async (status, runStatus) => {
    const { runtime, state, task } = await host("codex", "codex");
    const store = new AgentStore(state.db);
    const local = {
      binding: desktopBinding(LOCAL_WORKSPACE_ID),
      sessionId: null,
      task: { ...task, status },
    };
    store.put(local);

    const detail = runtime.localTask(LOCAL_WORKSPACE_ID, task.id, 0);
    expect(detail.runStatus).toBe(runStatus);
    expect(localResults["agents.local.get"].parse(detail).runStatus).toBe(runStatus);
    expect(store.get(task.id)).toEqual(local);
    expect(runtime.localTasks(LOCAL_WORKSPACE_ID, 10)[0]?.status).toBe(status);
  },
);

it.each([
  ["permission", "waiting_approval"],
  ["plan", "waiting_approval"],
  ["question", "waiting_input"],
] as const)("resolves a waiting Run from its stored %s request", async (kind, runStatus) => {
  const { runtime, state, task } = await host("codex", "codex");
  const store = new AgentStore(state.db);
  const binding = desktopBinding(LOCAL_WORKSPACE_ID);
  store.put({ binding, sessionId: null, task: { ...task, status: "waiting" } });
  const request: HumanRequest = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind,
    title: "Confirm",
    body: "Review",
    questions: [],
    status: "pending",
    decision: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  store.request(binding, request);
  expect(runtime.localTask(LOCAL_WORKSPACE_ID, task.id, 0).runStatus).toBe(runStatus);
  store.request(binding, { ...request, status: "decided", decision: { type: "deny", note: "No" } });
  expect(runtime.localTask(LOCAL_WORKSPACE_ID, task.id, 0).runStatus).toBe(runStatus);
  for (const status of ["applied", "cancelled", "expired"] as const) {
    store.request(binding, { ...request, status });
    expect(() => runtime.localTask(LOCAL_WORKSPACE_ID, task.id, 0)).toThrow(
      expect.objectContaining({ code: "INVALID_AGENT_RUN_PROJECTION" }),
    );
  }
});

it("rejects missing, foreign and ambiguous waiting requests instead of choosing a Run state", async () => {
  const { runtime, state, task } = await host("codex", "codex");
  const store = new AgentStore(state.db);
  const binding = desktopBinding(LOCAL_WORKSPACE_ID);
  store.put({ binding, sessionId: null, task: { ...task, status: "waiting" } });
  const invalid = () =>
    expect(() => runtime.localTask(LOCAL_WORKSPACE_ID, task.id, 0)).toThrow(
      expect.objectContaining({ code: "INVALID_AGENT_RUN_PROJECTION" }),
    );
  invalid();
  const request: HumanRequest = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "permission",
    title: "Confirm",
    body: "Review",
    questions: [],
    status: "pending",
    decision: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  store.request("another-binding", request);
  store.request(binding, { ...request, id: crypto.randomUUID(), taskId: crypto.randomUUID() });
  invalid();
  store.request(binding, { ...request, id: crypto.randomUUID() });
  expect(runtime.localTask(LOCAL_WORKSPACE_ID, task.id, 0).runStatus).toBe("waiting_approval");
  store.request(binding, { ...request, id: crypto.randomUUID(), kind: "question" });
  invalid();
});
