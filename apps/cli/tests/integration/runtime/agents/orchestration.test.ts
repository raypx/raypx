import { expect, it } from "vite-plus/test";
import { join } from "node:path";
import {
  captureOrchestration,
  EPOCH,
  goldenDifference,
  orchestrationHost,
} from "../../../helpers/orchestration";
import { AgentRuntime } from "../../../../src/runtime/agents";
import type { AgentTask } from "@raypx/core/tasks";

/**
 * Characterization goldens for ADR 0044.
 *
 * These record today's journalled events, task-change notifications and the
 * request/activity projections for each orchestration scenario. The event-sourced
 * implementation must produce exactly these records; a change is a wire-format
 * change and needs its own decision. Regenerate deliberately with
 * `ORCHESTRATION_GOLDENS=write`.
 */

/** Local commands expire 15s after the frozen host clock, so starts share that window. */
const deadline = new Date(EPOCH.getTime() + 10_000).toISOString();

/** Poll against real time; `expect.poll` shares the frozen host clock here. */
async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (condition()) return;
    await Bun.sleep(10);
  }
  throw new Error("Condition never became true");
}

const events = (runtime: AgentRuntime, binding: string) =>
  runtime.replay(binding, 0).events.map((item) => item.event);
const requestOf = (runtime: AgentRuntime, binding: string) =>
  events(runtime, binding)
    .filter((event) => event.kind === "request")
    .at(-1);
const requestIdOf = (runtime: AgentRuntime, binding: string) => {
  const value = requestOf(runtime, binding);
  if (value?.kind !== "request") throw new Error("Missing request");
  return value.request.id;
};
const statusOf = (runtime: AgentRuntime, binding: string) => {
  const value = events(runtime, binding).at(-1);
  return value?.kind === "status" ? value.status : undefined;
};

it("records a Codex approval round trip on a relay binding", async () => {
  const f = await orchestrationHost("codex", "codex-approval");
  const binding = "relay:device";
  const task: AgentTask = { ...f.task, mode: "run" };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await f.gate("approval");
  f.release("approval");
  await waitFor(() => requestOf(f.runtime, binding) !== undefined);
  await f.runtime.command(binding, {
    id: crypto.randomUUID(),
    type: "decision",
    taskId: task.id,
    requestId: requestIdOf(f.runtime, binding),
    decision: { type: "allow" },
  });
  await waitFor(() => statusOf(f.runtime, binding) === "succeeded");
  expect(
    goldenDifference(
      "codex-approval",
      captureOrchestration(f.runtime, f.state, f.notifications, binding, task.id),
    ),
  ).toBeUndefined();
});

it("records a local Desktop approval through the private binding", async () => {
  const f = await orchestrationHost("codex", "codex-approval");
  const account = "desktop-user";
  const device = await f.runtime.localDevice(account);
  const input = {
    id: f.task.id,
    deviceId: device.id,
    projectId: f.task.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Local approval",
  };
  await f.runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await f.gate("approval");
  f.release("approval");
  await waitFor(() => f.runtime.localApprovals(account).length === 1);
  const request = f.runtime.localApprovals(account)[0]!;
  await f.runtime.localExecute(account, crypto.randomUUID(), {
    method: "approvals.decide",
    input: { id: request.id, decision: { type: "allow" } },
  });
  await waitFor(() => f.runtime.localTask(account, input.id, 0).task.status === "succeeded");
  expect(
    goldenDifference(
      "desktop-approval",
      captureOrchestration(f.runtime, f.state, f.notifications, `desktop:${account}`, input.id),
    ),
  ).toBeUndefined();
});

it("records an approval that expires before a decision", async () => {
  // The fixture's second token is the request deadline; it is already past the
  // frozen host clock, so expiry commits immediately instead of a real-time wait.
  const f = await orchestrationHost("codex", "codex-question 2025-12-31T23:59:59.000Z");
  const account = "orchestration-expiry";
  const device = await f.runtime.localDevice(account);
  const input = {
    id: f.task.id,
    deviceId: device.id,
    projectId: f.task.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Ask and expire",
  };
  await f.runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await f.gate("question");
  f.release("question");
  await waitFor(
    () => f.runtime.localTask(account, input.id, 0).requests.at(0)?.status === "expired",
  );
  await waitFor(() => f.runtime.localTask(account, input.id, 0).task.status === "succeeded");
  expect(
    goldenDifference(
      "codex-expiry",
      captureOrchestration(f.runtime, f.state, f.notifications, `desktop:${account}`, input.id),
    ),
  ).toBeUndefined();
});

it("records a cancellation at the approval gate", async () => {
  const f = await orchestrationHost("codex", "codex-approval");
  const binding = "relay:cancel";
  const task: AgentTask = { ...f.task, mode: "run" };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await f.gate("approval");
  f.release("approval");
  await waitFor(() => requestOf(f.runtime, binding) !== undefined);
  await f.runtime.command(binding, { id: crypto.randomUUID(), type: "cancel", taskId: task.id });
  await waitFor(() => statusOf(f.runtime, binding) === "cancelled");
  expect(
    goldenDifference(
      "codex-cancel-approval",
      captureOrchestration(f.runtime, f.state, f.notifications, binding, task.id),
    ),
  ).toBeUndefined();
});

it("records a cancellation during the first turn", async () => {
  const f = await orchestrationHost("codex", "codex-run");
  const binding = "relay:cancel-turn";
  const task: AgentTask = { ...f.task, mode: "run" };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await f.gate("turn");
  await f.runtime.command(binding, { id: crypto.randomUUID(), type: "cancel", taskId: task.id });
  f.release("turn");
  await waitFor(() => statusOf(f.runtime, binding) === "cancelled");
  expect(
    goldenDifference(
      "codex-cancel-turn",
      captureOrchestration(f.runtime, f.state, f.notifications, binding, task.id),
    ),
  ).toBeUndefined();
});

it("records a queued input delivered after the running turn", async () => {
  const f = await orchestrationHost("codex", "codex-queue");
  const account = "orchestration-queue";
  const device = await f.runtime.localDevice(account);
  const input = {
    id: f.task.id,
    deviceId: device.id,
    projectId: f.task.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "First turn",
  };
  await f.runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await f.gate("turn");
  const queued = {
    id: crypto.randomUUID(),
    taskId: input.id,
    mode: "queue" as const,
    prompt: "Second",
  };
  expect(
    await f.runtime.localExecute(account, queued.id, { method: "tasks.input", input: queued }),
  ).toMatchObject({ ok: true, value: { status: "queued" } });
  f.release("turn");
  await waitFor(() => f.delivered().some((entry) => entry.kind === "turn" && entry.turn === 2));
  f.release("turn");
  await waitFor(() => f.runtime.localTask(account, input.id, 0).task.status === "succeeded");
  expect(
    f.runtime.localTask(account, input.id, 0).activity.find((entry) => entry.id === queued.id),
  ).toMatchObject({ status: "sent" });
  expect(
    goldenDifference(
      "codex-queue",
      captureOrchestration(f.runtime, f.state, f.notifications, `desktop:${account}`, input.id),
    ),
  ).toBeUndefined();
});

it("records a steer on the running turn", async () => {
  const f = await orchestrationHost("codex", "codex-steer");
  const account = "orchestration-steer";
  const device = await f.runtime.localDevice(account);
  const input = {
    id: f.task.id,
    deviceId: device.id,
    projectId: f.task.projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "First turn",
  };
  await f.runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await f.gate("turn");
  const steer = {
    id: crypto.randomUUID(),
    taskId: input.id,
    mode: "steer" as const,
    prompt: "Now",
  };
  expect(
    await f.runtime.localExecute(account, steer.id, { method: "tasks.input", input: steer }),
  ).toMatchObject({ ok: true });
  await waitFor(() =>
    f.runtime
      .localTask(account, input.id, 0)
      .activity.some(
        (entry) => entry.id === steer.id && entry.kind === "input" && entry.status === "sent",
      ),
  );
  await waitFor(() => f.runtime.localTask(account, input.id, 0).task.status === "succeeded");
  expect(
    goldenDifference(
      "codex-steer",
      captureOrchestration(f.runtime, f.state, f.notifications, `desktop:${account}`, input.id),
    ),
  ).toBeUndefined();
});

it("records Codex plan approval as a follow-up turn", async () => {
  const f = await orchestrationHost("codex", "codex-plan");
  const binding = "relay:plan-codex";
  const task: AgentTask = { ...f.task, mode: "plan" };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await f.gate("plan");
  f.release("plan");
  await waitFor(() => requestOf(f.runtime, binding) !== undefined);
  await f.runtime.command(binding, {
    id: crypto.randomUUID(),
    type: "decision",
    taskId: task.id,
    requestId: requestIdOf(f.runtime, binding),
    decision: { type: "allow" },
  });
  await f.gate("turn");
  f.release("turn");
  await waitFor(() => statusOf(f.runtime, binding) === "succeeded");
  expect(
    goldenDifference(
      "codex-plan",
      captureOrchestration(f.runtime, f.state, f.notifications, binding, task.id),
    ),
  ).toBeUndefined();
});

it("records a Claude plan that resumes as a new process", async () => {
  // Reuses the fixture that already models a headless plan and its resumed run.
  const f = await orchestrationHost("claude", "claude-plan", "claude-headless-plan");
  const account = "orchestration-plan-claude";
  const binding = `desktop:${account}`;
  const device = await f.runtime.localDevice(account);
  const task: AgentTask = { ...f.task, mode: "plan", deviceId: device.id };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await waitFor(() => requestOf(f.runtime, binding) !== undefined);
  await f.runtime.command(binding, {
    id: crypto.randomUUID(),
    type: "decision",
    taskId: task.id,
    requestId: requestIdOf(f.runtime, binding),
    decision: { type: "allow" },
  });
  await waitFor(() => statusOf(f.runtime, binding) === "succeeded");
  expect(
    goldenDifference(
      "claude-plan",
      captureOrchestration(f.runtime, f.state, f.notifications, binding, task.id),
    ),
  ).toBeUndefined();
});

it("records a host restart that interrupts active work", async () => {
  const f = await orchestrationHost("codex", "codex-run");
  const binding = "relay:restart";
  const task: AgentTask = { ...f.task, mode: "run" };
  await f.runtime.start(binding, crypto.randomUUID(), task, deadline);
  await f.gate("turn");
  await f.runtime.close();
  const restarted = new AgentRuntime(f.state, () => {}, {
    executables: { codex: join(f.directory, "codex") },
  });
  try {
    expect(
      goldenDifference(
        "codex-restart",
        captureOrchestration(restarted, f.state, [], binding, task.id),
      ),
    ).toBeUndefined();
  } finally {
    await restarted.close();
  }
});
