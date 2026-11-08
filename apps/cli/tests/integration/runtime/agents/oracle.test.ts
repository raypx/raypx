import { expect, it } from "vite-plus/test";
import { EPOCH, orchestrationHost } from "../../../helpers/orchestration";
import { AgentStore } from "../../../../src/runtime/agents/store";
import { fold } from "../../../../src/runtime/agents/domain/fold";
import type { AgentRuntime } from "../../../../src/runtime/agents";
import type { StateStore } from "../../../../src/runtime/state";
import type { AgentTask } from "@raypx/core/tasks";

/**
 * Oracle: folding a task's committed events reproduces its task, request and input
 * records. It holds for tasks created after the orchestration migration, whose
 * history was recorded from creation.
 */

const deadline = new Date(EPOCH.getTime() + 10_000).toISOString();

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (condition()) return;
    await Bun.sleep(10);
  }
  throw new Error("Condition never became true");
}

/** Assert the fold and return how many events it consumed. */
function expectFoldMatchesProjection(state: StateStore, binding: string, taskId: string) {
  const store = new AgentStore(state.db);
  const history = store.history(binding, taskId);
  // Activity stays a projection only; it never enters the durable history.
  expect(history.some((event) => event.type === "activity.recorded")).toBe(false);
  const folded = fold(history);
  const stored = store.get(taskId);
  // The history is real: it reaches a terminal status and every request it raised.
  expect(history.length).toBeGreaterThan(2);
  expect(stored?.task.status).toMatch(/succeeded|cancelled/);
  expect(folded.task?.status).toBe(stored?.task.status);
  expect(folded.task).toEqual(stored?.task);
  expect(folded.sessionId).toEqual(stored?.sessionId);
  expect(folded.requests).toEqual(store.requests(binding, taskId));
  expect(folded.inputs).toEqual(
    store.activity(binding, taskId).filter((entry) => entry.kind === "input"),
  );
  return history.length;
}

const lastStatus = (runtime: AgentRuntime, binding: string) => {
  const event = runtime.replay(binding, 0).events.at(-1)?.event;
  return event?.kind === "status" ? event.status : undefined;
};

it("folds an approved relay run back to its task and request records", async () => {
  const f = await orchestrationHost("codex", "codex-approval");
  const binding = "relay:oracle";
  const task: AgentTask = { ...f.task, mode: "run" };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await f.gate("approval");
  f.release("approval");
  await waitFor(() =>
    f.runtime.replay(binding, 0).events.some((item) => item.event.kind === "request"),
  );
  const request = f.runtime
    .replay(binding, 0)
    .events.map((item) => item.event)
    .find((event) => event.kind === "request");
  if (request?.kind !== "request") throw new Error("Missing request");
  await f.runtime.command(binding, {
    id: crypto.randomUUID(),
    type: "decision",
    taskId: task.id,
    requestId: request.request.id,
    decision: { type: "allow" },
  });
  await waitFor(() => lastStatus(f.runtime, binding) === "succeeded");
  expect(expectFoldMatchesProjection(f.state, binding, task.id)).toBeGreaterThan(2);
});

it("folds a local run with a queued input and a cancelled approval", async () => {
  const f = await orchestrationHost("codex", "codex-approval");
  const account = "oracle-local";
  const device = await f.runtime.localDevice(account);
  const input = {
    id: f.task.id,
    deviceId: device.id,
    projectId: f.task.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Oracle",
  };
  await f.runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await f.gate("approval");
  f.release("approval");
  await waitFor(() => f.runtime.localApprovals(account).length === 1);
  const queued = {
    id: crypto.randomUUID(),
    taskId: input.id,
    mode: "queue" as const,
    prompt: "Later",
  };
  await f.runtime.localExecute(account, queued.id, { method: "tasks.input", input: queued });
  await f.runtime.localExecute(account, crypto.randomUUID(), {
    method: "tasks.cancel",
    input: { id: input.id },
  });
  await waitFor(() => f.runtime.localTask(account, input.id, 0).task.status === "cancelled");
  expect(expectFoldMatchesProjection(f.state, `desktop:${account}`, input.id)).toBeGreaterThan(2);
});

it("folds a Codex plan whose approval switches the task to run mode", async () => {
  const f = await orchestrationHost("codex", "codex-plan");
  const binding = "relay:oracle-plan";
  const task: AgentTask = { ...f.task, mode: "plan" };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await f.gate("plan");
  f.release("plan");
  await waitFor(() =>
    f.runtime.replay(binding, 0).events.some((item) => item.event.kind === "request"),
  );
  const request = f.runtime
    .replay(binding, 0)
    .events.map((item) => item.event)
    .find((event) => event.kind === "request");
  if (request?.kind !== "request") throw new Error("Missing request");
  await f.runtime.command(binding, {
    id: crypto.randomUUID(),
    type: "decision",
    taskId: task.id,
    requestId: request.request.id,
    decision: { type: "allow" },
  });
  await f.gate("turn");
  f.release("turn");
  await waitFor(() => lastStatus(f.runtime, binding) === "succeeded");
  expect(expectFoldMatchesProjection(f.state, binding, task.id)).toBeGreaterThan(2);
});
